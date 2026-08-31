import { Injectable } from '@nestjs/common';

import { ClinicProfileRecord, SaveClinicProfileData } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClinicProfile } from '../../../generated/prisma/client';

/**
 * Persistence for the clinic's own identity (P16-T02).
 *
 * Every query targets the single-tenant facility-less row (`facilityId:
 * null`); the partial unique index in the migration is what keeps it a
 * singleton, the same arrangement the two BPJS config tables use.
 */
@Injectable()
export class ClinicProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findProfile(): Promise<ClinicProfileRecord | null> {
    const row = await this.prismaService.clinicProfile.findFirst({
      where: { facilityId: null },
    });
    return row === null ? null : this.toRecord(row);
  }

  async createProfile(
    data: SaveClinicProfileData & { name: string },
  ): Promise<ClinicProfileRecord> {
    const row = await this.prismaService.clinicProfile.create({
      data: { facilityId: null, ...data },
    });
    return this.toRecord(row);
  }

  /**
   * Applies a partial update. `undefined` fields are absent from the Prisma
   * payload and leave their column alone; `null` clears it — the three-state
   * semantics the PATCH schema promises, carried all the way down rather than
   * flattened into "replace everything".
   */
  async updateProfile(id: string, data: SaveClinicProfileData): Promise<ClinicProfileRecord> {
    const row = await this.prismaService.clinicProfile.update({
      where: { id },
      data,
    });
    return this.toRecord(row);
  }

  private toRecord(row: ClinicProfile): ClinicProfileRecord {
    return {
      id: row.id,
      name: row.name,
      legalName: row.legalName,
      address: row.address,
      phoneNumber: row.phoneNumber,
      email: row.email,
      licenseNumber: row.licenseNumber,
      taxId: row.taxId,
      logoStorageKey: row.logoStorageKey,
      logoMimeType: row.logoMimeType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
