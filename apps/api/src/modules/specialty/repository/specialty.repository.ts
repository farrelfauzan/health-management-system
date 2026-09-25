import {
  CreateSpecialtyRecordPayload,
  ListSpecialtiesParams,
  SpecialtyRecord,
  SpecialtyUsageCounts,
  UpdateSpecialtyRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

const SPECIALTY_SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SpecialtyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSpecialties(params: ListSpecialtiesParams): Promise<SpecialtyRecord[]> {
    const { search, isActive } = params;
    return this.prisma.findManyActive(this.prisma.specialty, {
      where: {
        ...(isActive === undefined ? {} : { isActive }),
        ...(search
          ? {
              name: {
                contains: search,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      },
      orderBy: {
        name: 'asc',
      },
      select: SPECIALTY_SELECT,
    });
  }

  async findSpecialtyById(id: string): Promise<SpecialtyRecord | null> {
    return this.prisma.findFirstActive(this.prisma.specialty, {
      where: { id },
      select: SPECIALTY_SELECT,
    });
  }

  /**
   * Any row already carrying this name, ignoring case and including
   * soft-deleted rows: `specialties.name` is unique across all of them, so a
   * deleted "Kebidanan" still blocks a new one at the database.
   */
  async findSpecialtyByName(name: string): Promise<{ id: string } | null> {
    return this.prisma.specialty.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  async createSpecialty(payload: CreateSpecialtyRecordPayload): Promise<SpecialtyRecord> {
    return this.prisma.specialty.create({
      data: { name: payload.name, description: payload.description },
      select: SPECIALTY_SELECT,
    });
  }

  async updateSpecialty(
    id: string,
    payload: UpdateSpecialtyRecordPayload,
  ): Promise<SpecialtyRecord> {
    return this.prisma.specialty.update({
      where: { id },
      data: {
        ...(payload.name === undefined ? {} : { name: payload.name }),
        ...(payload.description === undefined ? {} : { description: payload.description }),
        ...(payload.isActive === undefined ? {} : { isActive: payload.isActive }),
      },
      select: SPECIALTY_SELECT,
    });
  }

  /**
   * The dependants that make deactivating a poli a mistake. Inactive
   * clinicians and retired tariffs are left out: they already stopped offering
   * or pricing the poli, and history keeps pointing at it either way.
   */
  async countActiveUsage(id: string): Promise<SpecialtyUsageCounts> {
    const [activeClinicianCount, activeTariffCount] = await Promise.all([
      this.prisma.doctorProfile.count({
        where: { specialtyId: id, isActive: true, deletedAt: null },
      }),
      this.prisma.serviceTariff.count({
        where: { specialtyId: id, isActive: true, deletedAt: null },
      }),
    ]);
    return { activeClinicianCount, activeTariffCount };
  }
}
