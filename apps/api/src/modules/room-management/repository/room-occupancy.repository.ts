import { BedStatusTallyRecord, RoomOccupancyParams, RoomRecord, WardRecord } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const OCCUPANCY_ROOM_INCLUDE = {
  ward: { select: { id: true, code: true, name: true } },
  roomClass: { select: { id: true, code: true, name: true } },
} satisfies Prisma.RoomInclude;

const OCCUPANCY_ROOM_ORDER_BY = [
  { wardId: 'asc' },
  { code: 'asc' },
] satisfies Prisma.RoomOrderByWithRelationInput[];

/**
 * The occupancy board's read side. Deliberately three narrow queries rather
 * than one deep `include`: the board needs a *count* per room and status, and
 * loading every bed row to length-check it in TypeScript would fetch the whole
 * ward to answer a number the database already has.
 */
@Injectable()
export class RoomOccupancyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWardsForOccupancy(params: RoomOccupancyParams): Promise<WardRecord[]> {
    const rows = await this.prisma.findManyActive(this.prisma.ward, {
      where: params.wardId ? { id: params.wardId } : {},
      orderBy: { code: 'asc' as const },
    });

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listRoomsForOccupancy(params: RoomOccupancyParams): Promise<RoomRecord[]> {
    const rows = await this.prisma.findManyActive(this.prisma.room, {
      where: {
        ...(params.wardId ? { wardId: params.wardId } : {}),
        ...(params.roomClassId ? { roomClassId: params.roomClassId } : {}),
      },
      orderBy: OCCUPANCY_ROOM_ORDER_BY,
      include: OCCUPANCY_ROOM_INCLUDE,
    });

    return rows.map((row) => ({
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
    }));
  }

  async tallyBedStatuses(roomIds: string[]): Promise<BedStatusTallyRecord[]> {
    if (roomIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.bed.groupBy({
      by: ['roomId', 'status'],
      where: { roomId: { in: roomIds }, deletedAt: null },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      roomId: row.roomId,
      status: row.status,
      count: row._count._all,
    }));
  }
}
