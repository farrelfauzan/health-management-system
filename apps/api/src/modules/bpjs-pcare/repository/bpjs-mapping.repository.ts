import {
  BpjsDoctorMappingRecord,
  BpjsMedicationMappingRecord,
  BpjsSpecialtyMappingRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsDphoCodeConflictError } from './bpjs-dpho-code-conflict.error';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * Persistence for the BPJS mapping columns that live on other modules'
 * entities (DoctorProfile.bpjsDoctorCode, Specialty.bpjsPoliCode,
 * Medication.dphoCode). Owning this narrow slice here mirrors the SATUSEHAT
 * link repository: the BPJS module touches exactly its own columns and
 * nothing else of the host rows.
 */
@Injectable()
export class BpjsMappingRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listDoctorMappings(): Promise<BpjsDoctorMappingRecord[]> {
    const rows = await this.prismaService.findManyActive(this.prismaService.doctorProfile, {
      select: {
        id: true,
        fullName: true,
        bpjsDoctorCode: true,
        specialty: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((row) => ({
      doctorId: row.id,
      fullName: row.fullName,
      specialtyName: row.specialty.name,
      bpjsDoctorCode: row.bpjsDoctorCode,
    }));
  }

  async listSpecialtyMappings(): Promise<BpjsSpecialtyMappingRecord[]> {
    const rows = await this.prismaService.findManyActive(this.prismaService.specialty, {
      select: { id: true, name: true, bpjsPoliCode: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      specialtyId: row.id,
      name: row.name,
      bpjsPoliCode: row.bpjsPoliCode,
    }));
  }

  async setDoctorMapping(
    doctorId: string,
    bpjsDoctorCode: string | null,
  ): Promise<BpjsDoctorMappingRecord | null> {
    const target = await this.prismaService.findFirstActive(this.prismaService.doctorProfile, {
      where: { id: doctorId },
      select: { id: true },
    });
    if (target === null) {
      return null;
    }
    const row = await this.prismaService.doctorProfile.update({
      where: { id: doctorId },
      data: { bpjsDoctorCode },
      select: {
        id: true,
        fullName: true,
        bpjsDoctorCode: true,
        specialty: { select: { name: true } },
      },
    });
    return {
      doctorId: row.id,
      fullName: row.fullName,
      specialtyName: row.specialty.name,
      bpjsDoctorCode: row.bpjsDoctorCode,
    };
  }

  async setSpecialtyMapping(
    specialtyId: string,
    bpjsPoliCode: string | null,
  ): Promise<BpjsSpecialtyMappingRecord | null> {
    const target = await this.prismaService.findFirstActive(this.prismaService.specialty, {
      where: { id: specialtyId },
      select: { id: true },
    });
    if (target === null) {
      return null;
    }
    const row = await this.prismaService.specialty.update({
      where: { id: specialtyId },
      data: { bpjsPoliCode },
      select: { id: true, name: true, bpjsPoliCode: true },
    });
    return { specialtyId: row.id, name: row.name, bpjsPoliCode: row.bpjsPoliCode };
  }

  async setMedicationMapping(
    medicationId: string,
    dphoCode: string | null,
  ): Promise<BpjsMedicationMappingRecord | null> {
    const target = await this.prismaService.findFirstActive(this.prismaService.medication, {
      where: { id: medicationId },
      select: { id: true },
    });
    if (target === null) {
      return null;
    }
    const row = await this.prismaService.medication
      .update({
        where: { id: medicationId },
        data: { dphoCode },
        select: { id: true, code: true, name: true, dphoCode: true },
      })
      .catch((caughtError: unknown) => rethrowDphoCodeConflict(caughtError, dphoCode));
    return { medicationId: row.id, code: row.code, name: row.name, dphoCode: row.dphoCode };
  }
}

function rethrowDphoCodeConflict(caughtError: unknown, dphoCode: string | null): never {
  const candidate = caughtError as { code?: unknown };
  if (candidate.code === UNIQUE_CONSTRAINT_ERROR_CODE && dphoCode !== null) {
    throw new BpjsDphoCodeConflictError(dphoCode);
  }
  throw caughtError;
}
