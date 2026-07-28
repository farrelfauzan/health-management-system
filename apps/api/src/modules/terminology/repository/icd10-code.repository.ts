import { Icd10CodeRecord, SearchIcd10CodesParams } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class Icd10CodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches the term against the code and both title columns. Clinicians search
   * in Indonesian as often as in English, and often type the code directly, so
   * all three are searched rather than the English title alone.
   */
  async searchIcd10Codes(params: SearchIcd10CodesParams): Promise<Icd10CodeRecord[]> {
    const { search, category, isActive, limit } = params;
    return this.prisma.findManyActive(this.prisma.icd10Code, {
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
        chapter: true,
        isActive: true,
      },
      orderBy: {
        code: 'asc',
      },
      take: limit,
    });
  }
}
