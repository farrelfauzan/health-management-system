import {
  CreateWardRecordPayload,
  ListWardsParams,
  PagedRecords,
  UpdateWardRecordPayload,
  WardRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { InventoryCodeConflictError } from './inventory-code-conflict.error';

const UNIQUE_VIOLATION_CODE = 'P2002';

type WardRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class WardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWards(params: ListWardsParams): Promise<PagedRecords<WardRecord>> {
    const { page, limit, search, isActive } = params;
    const skip = (page - 1) * limit;
    const where = {
      ...(isActive === undefined ? {} : { isActive }),
      ...this.buildSearchFilter(search),
    };
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const wards = await this.prisma.findManyActive(tx.ward, {
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' as const },
      });
      const count = await this.prisma.countActive(tx.ward, { where });
      return [wards, count] as const;
    });

    return { items: rows.map((row) => this.toWardRecord(row)), page, limit, total };
  }

  async findWardById(id: string): Promise<WardRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.ward, { where: { id } });
    return row ? this.toWardRecord(row) : null;
  }

  async countLiveRooms(wardId: string): Promise<number> {
    return this.prisma.countActive(this.prisma.room, { where: { wardId } });
  }

  async createWard(payload: CreateWardRecordPayload): Promise<WardRecord> {
    try {
      const created = await this.prisma.ward.create({
        data: {
          code: payload.code,
          name: payload.name,
          description: payload.description,
          isActive: payload.isActive,
        },
      });
      return this.toWardRecord(created);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async updateWard(payload: UpdateWardRecordPayload): Promise<WardRecord> {
    const { id, ...changes } = payload;
    const updated = await this.prisma.ward.update({ where: { id }, data: changes });
    return this.toWardRecord(updated);
  }

  async softDeleteWard(id: string): Promise<void> {
    await this.prisma.softDelete(this.prisma.ward, { id });
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
      return new InventoryCodeConflictError('ward');
    }
    return err;
  }

  private toWardRecord(row: WardRow): WardRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
