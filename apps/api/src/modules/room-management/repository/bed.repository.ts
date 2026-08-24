import {
  BedRecord,
  CreateBedRecordPayload,
  ListBedsParams,
  PagedRecords,
  UpdateBedRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { InventoryCodeConflictError } from './inventory-code-conflict.error';

const UNIQUE_VIOLATION_CODE = 'P2002';

type BedRow = {
  id: string;
  roomId: string;
  code: string;
  status: BedRecord['status'];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  room: {
    id: string;
    code: string;
    name: string;
    roomClass: { id: string; code: string; name: string };
    ward: { id: string; code: string; name: string };
  };
};

const BED_ROOM_INCLUDE = {
  room: {
    select: {
      id: true,
      code: true,
      name: true,
      roomClass: { select: { id: true, code: true, name: true } },
      ward: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.BedInclude;

const BED_LIST_ORDER_BY = [
  { roomId: 'asc' },
  { code: 'asc' },
] satisfies Prisma.BedOrderByWithRelationInput[];

@Injectable()
export class BedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBeds(params: ListBedsParams): Promise<PagedRecords<BedRecord>> {
    const { page, limit, wardId, roomId, status, search } = params;
    const skip = (page - 1) * limit;
    const where = {
      ...(roomId ? { roomId } : {}),
      ...(wardId ? { room: { wardId } } : {}),
      ...(status ? { status } : {}),
      ...(search ? { code: { contains: search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const beds = await this.prisma.findManyActive(tx.bed, {
        where,
        skip,
        take: limit,
        orderBy: BED_LIST_ORDER_BY,
        include: BED_ROOM_INCLUDE,
      });
      const count = await this.prisma.countActive(tx.bed, { where });
      return [beds, count] as const;
    });

    return { items: rows.map((row) => this.toBedRecord(row)), page, limit, total };
  }

  async findBedById(id: string): Promise<BedRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.bed, {
      where: { id },
      include: BED_ROOM_INCLUDE,
    });
    return row ? this.toBedRecord(row) : null;
  }

  /**
   * Whether a patient is in this bed right now. Asks the assignment table
   * rather than `status`, because `status` is the projection and an open
   * assignment is the fact — retiring a bed is refused on the fact.
   */
  async hasOpenAssignment(bedId: string): Promise<boolean> {
    const openAssignment = await this.prisma.bedAssignment.findFirst({
      where: { bedId, endedAt: null },
      select: { id: true },
    });
    return openAssignment !== null;
  }

  async createBed(payload: CreateBedRecordPayload): Promise<BedRecord> {
    try {
      const created = await this.prisma.bed.create({
        data: {
          roomId: payload.roomId,
          code: payload.code,
          status: payload.status,
          notes: payload.notes,
        },
        include: BED_ROOM_INCLUDE,
      });
      return this.toBedRecord(created);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async updateBed(payload: UpdateBedRecordPayload): Promise<BedRecord> {
    const { id, ...changes } = payload;
    const updated = await this.prisma.bed.update({
      where: { id },
      data: changes,
      include: BED_ROOM_INCLUDE,
    });
    return this.toBedRecord(updated);
  }

  async softDeleteBed(id: string): Promise<void> {
    await this.prisma.softDelete(this.prisma.bed, { id });
  }

  private mapUniqueViolation(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION_CODE) {
      return new InventoryCodeConflictError('bed');
    }
    return err;
  }

  private toBedRecord(row: BedRow): BedRecord {
    return {
      id: row.id,
      roomId: row.roomId,
      roomCode: row.room.code,
      roomName: row.room.name,
      roomClass: row.room.roomClass,
      wardId: row.room.ward.id,
      wardCode: row.room.ward.code,
      wardName: row.room.ward.name,
      code: row.code,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
