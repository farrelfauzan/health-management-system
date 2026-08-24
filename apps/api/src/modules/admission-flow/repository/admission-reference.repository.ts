import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Existence checks for the rows an admission points at.
 *
 * They live here rather than behind the owning modules' services because every
 * one of them is a foreign key this module is about to write, and the question
 * is "does this row exist and is it live" — not "may this caller read it",
 * which is what those services would additionally answer. `EncounterRepository`
 * reads `doctor_profiles` and `doctor_patients` for the same reason.
 */
@Injectable()
export class AdmissionReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLivePatient(id: string): Promise<{ id: string; fullName: string } | null> {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: { id },
      select: { id: true, fullName: true },
    });
  }

  async findLiveDoctor(id: string): Promise<{ id: string; isActive: boolean } | null> {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: { id },
      select: { id: true, isActive: true },
    });
  }

  async findLiveEncounter(id: string): Promise<{ id: string; patientId: string } | null> {
    return this.prisma.findFirstActive(this.prisma.encounter, {
      where: { id },
      select: { id: true, patientId: true },
    });
  }
}
