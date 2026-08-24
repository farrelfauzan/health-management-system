import {
  CreateRoomClassRecordPayload,
  ListRoomClassesParams,
  PagedRecords,
  RoomClassBedTallyRecord,
  RoomClassRecord,
  UpdateRoomClassRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { InventoryCodeConflictError } from './inventory-code-conflict.error';

const UNIQUE_VIOLATION_CODE = 'P2002';

type RoomClassRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  quota: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const ROOM_CLASS_ORDER_BY = [{ code: 'asc' }] satisfies Prisma.RoomClassOrderByWithRelationInput[];

@Injectable()
export class RoomClassRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRoomClasses(params: ListRoomClassesParams): Promise<PagedRecords<RoomClassRecord>> {
    const { page, limit, search, isActive } = params;
    const skip = (page - 1) * limit;
    const where = {
      ...(isActive === undefined ? {} : { isActive }),
      ...this.buildSearchFilter(search),
    };
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const roomClasses = await this.prisma.findManyActive(tx.roomClass, {
        where,
        skip,
        take: limit,
        orderBy: ROOM_CLASS_ORDER_BY,
      });
      const count = await this.prisma.countActive(tx.roomClass, { where });
      return [roomClasses, count] as const;
    });

    return { items: rows.map((row) => this.toRoomClassRecord(row)), page, limit, total };
  }

  async findRoomClassById(id: string): Promise<RoomClassRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.roomClass, { where: { id } });
    return row ? this.toRoomClassRecord(row) : null;
  }

  async countLiveRooms(roomClassId: string): Promise<number> {
    return this.prisma.countActive(this.prisma.room, { where: { roomClassId } });
  }

  /**
   * Live beds per class, the number a quota is measured against. Counted from
   * `beds` through `rooms` rather than stored on the class, because a stored
   * copy goes stale the moment a bed is added to a room somebody else was
   * editing.
   */
  async tallyBedsByRoomClass(roomClassIds: string[]): Promise<RoomClassBedTallyRecord[]> {
    if (roomClassIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.room.findMany({
      where: { roomClassId: { in: roomClassIds }, deletedAt: null },
      select: {
        roomClassId: true,
        _count: { select: { beds: { where: { deletedAt: null } } } },
      },
    });
    const tallies = new Map<string, number>();

    for (const row of rows) {
      tallies.set(row.roomClassId, (tallies.get(row.roomClassId) ?? 0) + row._count.beds);
    }

    return roomClassIds.map((roomClassId) => ({
      roomClassId,
      count: tallies.get(roomClassId) ?? 0,
    }));
  }

  async createRoomClass(payload: CreateRoomClassRecordPayload): Promise<RoomClassRecord> {
    try {
      const created = await this.prisma.roomClass.create({
        data: {
          code: payload.code,
          name: payload.name,
          description: payload.description,
          quota: payload.quota,
          isActive: payload.isActive,
        },
      });
      return this.toRoomClassRecord(created);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async updateRoomClass(payload: UpdateRoomClassRecordPayload): Promise<RoomClassRecord> {
    const { id, ...changes } = payload;
    const updated = await this.prisma.roomClass.update({ where: { id }, data: changes });
    return this.toRoomClassRecord(updated);
  }

  async softDeleteRoomClass(id: string): Promise<void> {
    await this.prisma.softDelete(this.prisma.roomClass, { id });
  }

  private buildSearchFilter(search?: string) {
    if (!search) {
      return {};
    }
    return {
      OR: [
        { code: { contains: search, mode: 'insensitive' as const } },
        { name: { contains: search, mode: 'insensitive' as const } },
      ],
    };
  }

  private mapUniqueViolation(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION_CODE) {
      return new InventoryCodeConflictError('room class');
    }
    return err;
  }

  private toRoomClassRecord(row: RoomClassRow): RoomClassRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      quota: row.quota,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
