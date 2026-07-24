import { ListSpecialtiesParams } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class SpecialtyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSpecialties(params: ListSpecialtiesParams) {
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
    });
  }
}
