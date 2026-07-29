import {
  CloseEncounterRecordPayload,
  CreateDiagnosisRecordPayload,
  CreateEncounterRecordPayload,
  CreateProcedureRecordPayload,
  CreateVitalSignsRecordPayload,
  DiagnosisRecord,
  EncounterDetailRecord,
  EncounterSourceRegistrationRecord,
  EncounterWithRelationsRecord,
  ListEncountersParams,
  ProcedureRecord,
  UpdateEncounterRecordPayload,
  VitalSignsRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

const ENCOUNTER_PATIENT_SELECT = {
  id: true,
  mrn: true,
  fullName: true,
  ownerUserId: true,
} satisfies Prisma.PatientProfileSelect;

const ENCOUNTER_DOCTOR_SELECT = {
  id: true,
  licenseNumber: true,
  fullName: true,
  ownerUserId: true,
} satisfies Prisma.DoctorProfileSelect;

const ENCOUNTER_LIST_INCLUDE = {
  patient: { select: ENCOUNTER_PATIENT_SELECT },
  doctor: { select: ENCOUNTER_DOCTOR_SELECT },
  _count: {
    select: {
      vitalSigns: true,
      diagnoses: true,
      procedures: true,
    },
  },
} satisfies Prisma.EncounterInclude;

/**
 * Child collections are filtered to live rows here rather than by
 * `findManyActive`, which only reaches the top-level `where`: a soft-deleted
 * diagnosis is a retracted one and must not reappear inside its encounter.
 */
const ENCOUNTER_DETAIL_INCLUDE = {
  patient: { select: ENCOUNTER_PATIENT_SELECT },
  doctor: { select: ENCOUNTER_DOCTOR_SELECT },
  vitalSigns: {
    where: { deletedAt: null },
    orderBy: { recordedAt: 'desc' },
  },
  diagnoses: {
    where: { deletedAt: null },
    orderBy: [{ type: 'asc' }, { recordedAt: 'asc' }],
  },
  procedures: {
    where: { deletedAt: null },
    orderBy: { performedAt: 'asc' },
  },
  prescriptions: {
    where: { deletedAt: null },
    select: {
      id: true,
      status: true,
      issuedAt: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.EncounterInclude;

@Injectable()
export class EncounterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRegistrationForEncounter(
    registrationId: string,
  ): Promise<EncounterSourceRegistrationRecord | null> {
    return this.prisma.findFirstActive(this.prisma.registration, {
      where: { id: registrationId },
      select: {
        id: true,
        patientId: true,
        status: true,
        patient: {
          select: {
            id: true,
            ownerUserId: true,
            isActive: true,
          },
        },
      },
    });
  }

  async findEncounterIdByRegistrationId(registrationId: string): Promise<{ id: string } | null> {
    return this.prisma.findFirstActive(this.prisma.encounter, {
      where: { registrationId },
      select: { id: true },
    });
  }

  async findActiveDoctorById(doctorId: string) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: { id: doctorId, isActive: true },
      select: { id: true, ownerUserId: true },
    });
  }

  async findActiveDoctorByOwnerUserId(ownerUserId: string) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: { ownerUserId, isActive: true },
      select: { id: true, ownerUserId: true },
    });
  }

  async findActiveDoctorPatientAssignment(doctorId: string, patientId: string) {
    return this.prisma.doctorPatient.findFirst({
      where: {
        doctorId,
        patientId,
        unassignedAt: null,
      },
      select: { id: true },
    });
  }

  async createEncounter(
    payload: CreateEncounterRecordPayload,
  ): Promise<EncounterWithRelationsRecord> {
    return this.prisma.encounter.create({
      data: {
        registrationId: payload.registrationId,
        patientId: payload.patientId,
        doctorId: payload.doctorId,
        createdById: payload.createdById,
      },
      include: ENCOUNTER_LIST_INCLUDE,
    });
  }

  async listEncounters(params: ListEncountersParams): Promise<{
    items: EncounterWithRelationsRecord[];
    page: number;
    limit: number;
    total: number;
  }> {
    const { page, limit, status, patientId, doctorId, registrationId } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(registrationId ? { registrationId } : {}),
      ...this.buildStartedAtFilter(params),
      ...this.buildOwnerFilter(params.ownerUserId),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const encounters = await this.prisma.findManyActive(tx.encounter, {
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' as const },
        include: ENCOUNTER_LIST_INCLUDE,
      });
      const count = await this.prisma.countActive(tx.encounter, { where });
      return [encounters, count] as const;
    });

    return { items, page, limit, total };
  }

  async findEncounterWithRelationsById(id: string): Promise<EncounterWithRelationsRecord | null> {
    return this.prisma.findFirstActive(this.prisma.encounter, {
      where: { id },
      include: ENCOUNTER_LIST_INCLUDE,
    });
  }

  async findEncounterDetailById(id: string): Promise<EncounterDetailRecord | null> {
    const encounter = await this.prisma.findFirstActive(this.prisma.encounter, {
      where: { id },
      include: ENCOUNTER_DETAIL_INCLUDE,
    });
    if (!encounter) {
      return null;
    }
    return {
      ...encounter,
      vitalSigns: encounter.vitalSigns.map((row) => this.toVitalSignsRecord(row)),
    };
  }

  async updateEncounter(
    payload: UpdateEncounterRecordPayload,
  ): Promise<EncounterWithRelationsRecord> {
    const { id, ...changes } = payload;
    return this.prisma.encounter.update({
      where: { id },
      data: changes,
      include: ENCOUNTER_LIST_INCLUDE,
    });
  }

  /**
   * Closes the encounter and moves its registration in one transaction. The
   * two rows describe the same visit from the clinical and the front-desk side;
   * committing one without the other leaves a finished patient sitting in the
   * queue, or a completed registration with an encounter still open.
   *
   * A FINISHED close also enqueues the SATUSEHAT outbox row (P10-T04) and,
   * for patients with a stored BPJS number while bridging is active, the
   * BPJS KUNJUNGAN outbox row (P11-T05) inside the same transaction —
   * writing another module's table here is deliberate: the outbox guarantee
   * is exactly that a closed visit and its reporting queue entry commit or
   * roll back together, and an after-commit enqueue would reintroduce the
   * silent-miss window the outbox exists to remove. A CANCELLED close (which
   * also cancels the registration) instead propagates a PENDAFTARAN_DELETE
   * when the visit's pendaftaran already reached PCare. Cancelled encounters
   * report nothing else.
   */
  async closeEncounter(payload: CloseEncounterRecordPayload): Promise<EncounterWithRelationsRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.registration.update({
        where: { id: payload.registrationId },
        data: {
          status: payload.registrationStatus,
          completedAt: payload.registrationStatus === 'COMPLETED' ? payload.endedAt : undefined,
        },
      });
      if (payload.status === 'FINISHED') {
        await tx.satusehatSubmission.create({ data: { encounterId: payload.id } });
        await this.enqueueBpjsKunjungan(tx, payload.registrationId);
      }
      if (payload.status === 'CANCELLED') {
        await this.propagateBpjsCancellation(tx, payload.registrationId);
      }
      return tx.encounter.update({
        where: { id: payload.id },
        data: {
          status: payload.status,
          endedAt: payload.endedAt,
        },
        include: ENCOUNTER_LIST_INCLUDE,
      });
    });
  }

  private async enqueueBpjsKunjungan(
    tx: PrismaTransactionClient,
    registrationId: string,
  ): Promise<void> {
    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
      select: { patient: { select: { bpjsNumberCiphertext: true } } },
    });
    if (!registration?.patient.bpjsNumberCiphertext) {
      return;
    }
    const activeConfig = await tx.bpjsPcareConfig.findFirst({
      where: { facilityId: null, isActive: true },
      select: { id: true },
    });
    if (!activeConfig) {
      return;
    }
    await tx.bpjsSubmission.upsert({
      where: { registrationId_type: { registrationId, type: 'KUNJUNGAN' } },
      create: { registrationId, type: 'KUNJUNGAN' },
      update: {},
    });
  }

  private async propagateBpjsCancellation(
    tx: PrismaTransactionClient,
    registrationId: string,
  ): Promise<void> {
    const pendaftaran = await tx.bpjsSubmission.findUnique({
      where: { registrationId_type: { registrationId, type: 'PENDAFTARAN' } },
      select: { status: true },
    });
    if (pendaftaran?.status !== 'SUBMITTED') {
      return;
    }
    await tx.bpjsSubmission.upsert({
      where: { registrationId_type: { registrationId, type: 'PENDAFTARAN_DELETE' } },
      create: { registrationId, type: 'PENDAFTARAN_DELETE' },
      update: {},
    });
  }

  async createVitalSigns(payload: CreateVitalSignsRecordPayload): Promise<VitalSignsRecord> {
    const created = await this.prisma.vitalSigns.create({
      data: {
        encounterId: payload.encounterId,
        heightCm: payload.heightCm,
        weightKg: payload.weightKg,
        systolicBloodPressure: payload.systolicBloodPressure,
        diastolicBloodPressure: payload.diastolicBloodPressure,
        pulseRate: payload.pulseRate,
        respiratoryRate: payload.respiratoryRate,
        temperatureCelsius: payload.temperatureCelsius,
        oxygenSaturation: payload.oxygenSaturation,
        notes: payload.notes,
        recordedAt: payload.recordedAt,
        recordedById: payload.recordedById,
      },
    });
    return this.toVitalSignsRecord(created);
  }

  async createDiagnosis(payload: CreateDiagnosisRecordPayload): Promise<DiagnosisRecord> {
    return this.prisma.diagnosis.create({
      data: {
        encounterId: payload.encounterId,
        icd10CodeId: payload.icd10CodeId,
        code: payload.code,
        display: payload.display,
        type: payload.type,
        notes: payload.notes,
        recordedById: payload.recordedById,
      },
    });
  }

  async findDiagnosisById(id: string): Promise<DiagnosisRecord | null> {
    return this.prisma.findFirstActive(this.prisma.diagnosis, { where: { id } });
  }

  async softDeleteDiagnosis(id: string): Promise<void> {
    await this.prisma.softDelete(this.prisma.diagnosis, { id });
  }

  async createProcedure(payload: CreateProcedureRecordPayload): Promise<ProcedureRecord> {
    return this.prisma.procedure.create({
      data: {
        encounterId: payload.encounterId,
        icd9cmCodeId: payload.icd9cmCodeId,
        code: payload.code,
        display: payload.display,
        notes: payload.notes,
        performedAt: payload.performedAt,
        recordedById: payload.recordedById,
      },
    });
  }

  async findProcedureById(id: string): Promise<ProcedureRecord | null> {
    return this.prisma.findFirstActive(this.prisma.procedure, { where: { id } });
  }

  async softDeleteProcedure(id: string): Promise<void> {
    await this.prisma.softDelete(this.prisma.procedure, { id });
  }

  private buildStartedAtFilter(params: ListEncountersParams) {
    const { startedFrom, startedTo } = params;
    if (!startedFrom && !startedTo) {
      return {};
    }
    return {
      startedAt: {
        ...(startedFrom ? { gte: startedFrom } : {}),
        ...(startedTo ? { lt: this.toExclusiveDayEnd(startedTo) } : {}),
      },
    };
  }

  /**
   * A patient sees their own record; a doctor sees the encounters they attended
   * plus those of patients currently assigned to them, because reading the
   * previous visit is part of conducting this one.
   */
  private buildOwnerFilter(ownerUserId?: string) {
    if (!ownerUserId) {
      return {};
    }
    return {
      OR: [
        { patient: { ownerUserId } },
        { doctor: { ownerUserId } },
        {
          patient: {
            doctors: {
              some: {
                unassignedAt: null,
                doctor: { ownerUserId },
              },
            },
          },
        },
      ],
    };
  }

  /** `startedTo` names a whole clinic day, so the bound is the next midnight. */
  private toExclusiveDayEnd(startedTo: Date): Date {
    const exclusiveEnd = new Date(startedTo);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    return exclusiveEnd;
  }

  /**
   * Prisma returns the decimal columns as `Decimal`; the domain works in plain
   * numbers, so the conversion happens here at the persistence boundary and no
   * `Decimal` escapes the repository.
   */
  private toVitalSignsRecord(row: {
    id: string;
    encounterId: string;
    heightCm: unknown;
    weightKg: unknown;
    systolicBloodPressure: number | null;
    diastolicBloodPressure: number | null;
    pulseRate: number | null;
    respiratoryRate: number | null;
    temperatureCelsius: unknown;
    oxygenSaturation: number | null;
    notes: string | null;
    recordedAt: Date;
    recordedById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): VitalSignsRecord {
    return {
      id: row.id,
      encounterId: row.encounterId,
      heightCm: this.toNullableNumber(row.heightCm),
      weightKg: this.toNullableNumber(row.weightKg),
      systolicBloodPressure: row.systolicBloodPressure,
      diastolicBloodPressure: row.diastolicBloodPressure,
      pulseRate: row.pulseRate,
      respiratoryRate: row.respiratoryRate,
      temperatureCelsius: this.toNullableNumber(row.temperatureCelsius),
      oxygenSaturation: row.oxygenSaturation,
      notes: row.notes,
      recordedAt: row.recordedAt,
      recordedById: row.recordedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toNullableNumber(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
  }
}
