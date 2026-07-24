import { ListSpecialtiesParams, Specialty, SpecialtyRecord } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { SpecialtyRepository } from '../repository/specialty.repository';

@Injectable()
export class SpecialtyService {
  constructor(private readonly specialtyRepository: SpecialtyRepository) {}

  async listSpecialties(params: ListSpecialtiesParams): Promise<Specialty[]> {
    const specialties = await this.specialtyRepository.listSpecialties(params);

    return specialties.map((specialty) => this.toSpecialtyResponse(specialty));
  }

  private toSpecialtyResponse(specialty: SpecialtyRecord): Specialty {
    return {
      id: specialty.id,
      name: specialty.name,
      description: specialty.description ?? undefined,
      isActive: specialty.isActive,
      createdAt: specialty.createdAt.toISOString(),
      updatedAt: specialty.updatedAt.toISOString(),
    };
  }
}
