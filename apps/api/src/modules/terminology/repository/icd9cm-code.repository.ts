import { Icd9cmCodeRecord, SearchIcd9cmCodesParams } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class Icd9cmCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches the term against the code and both title columns, mirroring the
   * ICD-10 lookup: clinicians search procedures in Indonesian as often as in
   * English, and often type the code directly.
   */
  async searchIcd9cmCodes(params: SearchIcd9cmCodesParams): Promise<Icd9cmCodeRecord[]> {
    const { search, category, isActive, limit } = params;
    return this.prisma.findManyActive(this.prisma.icd9cmCode, {
      where: {
        ...(isActive === undefined ? {} : { isActive }),
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { code: { startsWith: search, mode: 'insensitive' as const } },
                { display: { contains: search, mode: 'insensitive' as const } },
                { displayIndonesian: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        display: true,
        displayIndonesian: true,
        category: true,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
      take: limit,
    });
  }

  /** Resolves one active procedure code, for the same reason as the ICD-10 lookup. */
  async findActiveIcd9cmCodeById(id: string): Promise<Icd9cmCodeRecord | null> {
    return this.prisma.findFirstActive(this.prisma.icd9cmCode, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        display: true,
        displayIndonesian: true,
        category: true,
        isActive: true,
      },
    });
  }
}
