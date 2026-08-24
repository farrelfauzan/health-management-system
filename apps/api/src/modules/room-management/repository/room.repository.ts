import {
  CreateRoomRecordPayload,
  ListRoomsParams,
  PagedRecords,
  RoomRecord,
  UpdateRoomRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { InventoryCodeConflictError } from './inventory-code-conflict.error';

const UNIQUE_VIOLATION_CODE = 'P2002';

type RoomRow = {
  id: string;
  wardId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  ward: { id: string; code: string; name: string };
  roomClass: { id: string; code: string; name: string };
};

const ROOM_RELATIONS_INCLUDE = {
  ward: { select: { id: true, code: true, name: true } },
  roomClass: { select: { id: true, code: true, name: true } },
} satisfies Prisma.RoomInclude;

const ROOM_LIST_ORDER_BY = [
  { wardId: 'asc' },
  { code: 'asc' },
] satisfies Prisma.RoomOrderByWithRelationInput[];

@Injectable()
export class RoomRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRooms(params: ListRoomsParams): Promise<PagedRecords<RoomRecord>> {
    const { page, limit, wardId, roomClassId, search, isActive } = params;
    const skip = (page - 1) * limit;
    const where = {
      ...(wardId ? { wardId } : {}),
      ...(roomClassId ? { roomClassId } : {}),
      ...(isActive === undefined ? {} : { isActive }),
      ...this.buildSearchFilter(search),
    };
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const rooms = await this.prisma.findManyActive(tx.room, {
        where,
        skip,
        take: limit,
        orderBy: ROOM_LIST_ORDER_BY,
        include: ROOM_RELATIONS_INCLUDE,
      });
      const count = await this.prisma.countActive(tx.room, { where });
      return [rooms, count] as const;
    });

    return { items: rows.map((row) => this.toRoomRecord(row)), page, limit, total };
  }

  async findRoomById(id: string): Promise<RoomRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.room, {
      where: { id },
      include: ROOM_RELATIONS_INCLUDE,
    });
    return row ? this.toRoomRecord(row) : null;
  }

  async countLiveBeds(roomId: string): Promise<number> {
    return this.prisma.countActive(this.prisma.bed, { where: { roomId } });
  }

  async createRoom(payload: CreateRoomRecordPayload): Promise<RoomRecord> {
    try {
      const created = await this.prisma.room.create({
        data: {
          wardId: payload.wardId,
          roomClassId: payload.roomClassId,
          code: payload.code,
          name: payload.name,
          description: payload.description,
          isActive: payload.isActive,
        },
        include: ROOM_RELATIONS_INCLUDE,
      });
      return this.toRoomRecord(created);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async updateRoom(payload: UpdateRoomRecordPayload): Promise<RoomRecord> {
    const { id, ...changes } = payload;
    const updated = await this.prisma.room.update({
      where: { id },
      data: changes,
      include: ROOM_RELATIONS_INCLUDE,
    });
    return this.toRoomRecord(updated);
  }

  async softDeleteRoom(id: string): Promise<void> {
    await this.prisma.softDelete(this.prisma.room, { id });
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
      return new InventoryCodeConflictError('room');
    }
    return err;
  }

  private toRoomRecord(row: RoomRow): RoomRecord {
    return {
      id: row.id,
      wardId: row.wardId,
      wardCode: row.ward.code,
      wardName: row.ward.name,
      roomClass: row.roomClass,
      code: row.code,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
