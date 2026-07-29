import {
  BpjsSubmissionDoctorData,
  BpjsSubmissionPage,
  BpjsSubmissionRecord,
  BpjsSubmissionSourceData,
  ListBpjsSubmissionsParams,
  MarkBpjsSubmissionFailedPayload,
  MarkBpjsSubmissionRetryPayload,
  MarkBpjsSubmissionSubmittedPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsSubmission } from '../../../generated/prisma/client';

const DOCTOR_MAPPING_SELECT = {
  fullName: true,
  bpjsDoctorCode: true,
  specialty: { select: { bpjsPoliCode: true } },
} as const;

type DoctorMappingRow = {
  fullName: string;
  bpjsDoctorCode: string | null;
  specialty: { bpjsPoliCode: string | null };
};

/**
 * Persistence for the BPJS submission outbox. Mirrors the SATUSEHAT
 * submission repository: no payload snapshot is stored, so
 * {@link findSubmissionSourceData} re-reads the clinical record live at send
 * time, and this repository is the only place the patient's sealed BPJS
 * number is decrypted for a submission — solely into the outbound request.
 * Due-row claiming relies on the worker's in-process re-entrancy guard, the
 * same single-instance assumption the SATUSEHAT worker documents.
 */
@Injectable()
export class BpjsSubmissionRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly identifierCryptoService: NationalIdentifierCryptoService,
  ) {}

  async findDueSubmissions(limit: number): Promise<BpjsSubmissionRecord[]> {
    const rows = await this.prismaService.bpjsSubmission.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findSubmissionById(id: string): Promise<BpjsSubmissionRecord | null> {
    const row = await this.prismaService.bpjsSubmission.findUnique({ where: { id } });
    return row === null ? null : this.toRecord(row);
  }

  async findSubmissionPage(params: ListBpjsSubmissionsParams): Promise<BpjsSubmissionPage> {
    const where = {
      ...(params.status === undefined ? {} : { status: params.status }),
      ...(params.type === undefined ? {} : { type: params.type }),
      ...(params.registrationId === undefined ? {} : { registrationId: params.registrationId }),
    };
    const [rows, total] = await this.prismaService.$transaction([
      this.prismaService.bpjsSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prismaService.bpjsSubmission.count({ where }),
    ]);
    return { items: rows.map((row) => this.toRecord(row)), total };
  }

  async requeueSubmission(id: string): Promise<BpjsSubmissionRecord> {
    const row = await this.prismaService.bpjsSubmission.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
    });
    return this.toRecord(row);
  }

  async findSubmissionSourceData(registrationId: string): Promise<BpjsSubmissionSourceData | null> {
    const registration = await this.prismaService.registration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        status: true,
        queueDate: true,
        checkedInAt: true,
        patient: { select: { bpjsNumberCiphertext: true } },
        appointment: { select: { doctor: { select: DOCTOR_MAPPING_SELECT } } },
        encounter: {
          select: {
            id: true,
            status: true,
            endedAt: true,
            subjective: true,
            doctor: { select: DOCTOR_MAPPING_SELECT },
            vitalSigns: {
              orderBy: { recordedAt: 'desc' },
              take: 1,
              select: {
                systolicBloodPressure: true,
                diastolicBloodPressure: true,
                heightCm: true,
                weightKg: true,
                pulseRate: true,
                respiratoryRate: true,
              },
            },
            diagnoses: {
              where: { deletedAt: null },
              orderBy: [{ type: 'asc' }, { recordedAt: 'asc' }],
              select: { code: true, type: true },
            },
          },
        },
        bpjsSubmissions: {
          where: { type: 'PENDAFTARAN' },
          select: { status: true, bpjsReferenceNo: true, submittedKdPoli: true },
        },
      },
    });
    if (registration === null) {
      return null;
    }
    const latestVitals = registration.encounter?.vitalSigns[0];
    const pendaftaranRow = registration.bpjsSubmissions[0];
    return {
      registration: {
        id: registration.id,
        status: registration.status,
        queueDate: registration.queueDate,
        checkedInAt: registration.checkedInAt,
      },
      patient: {
        bpjsNumber:
          registration.patient.bpjsNumberCiphertext === null
            ? null
            : this.identifierCryptoService.decryptIdentifier(
                registration.patient.bpjsNumberCiphertext,
              ),
      },
      appointmentDoctor: this.toDoctorData(registration.appointment?.doctor ?? null),
      encounter:
        registration.encounter === null
          ? null
          : {
              id: registration.encounter.id,
              status: registration.encounter.status,
              endedAt: registration.encounter.endedAt,
              subjective: registration.encounter.subjective,
              doctor: this.toDoctorData(registration.encounter.doctor),
              vitals:
                latestVitals === undefined
                  ? null
                  : {
                      systolicBloodPressure: latestVitals.systolicBloodPressure,
                      diastolicBloodPressure: latestVitals.diastolicBloodPressure,
                      heightCm: this.toNumberOrNull(latestVitals.heightCm),
                      weightKg: this.toNumberOrNull(latestVitals.weightKg),
                      pulseRate: latestVitals.pulseRate,
                      respiratoryRate: latestVitals.respiratoryRate,
                    },
              diagnoses: registration.encounter.diagnoses.map((diagnosis) => ({
                code: diagnosis.code,
                type: diagnosis.type,
              })),
            },
      pendaftaran: pendaftaranRow === undefined ? null : { ...pendaftaranRow },
    };
  }

  async findRegistrationStatus(registrationId: string): Promise<string | null> {
    const row = await this.prismaService.registration.findUnique({
      where: { id: registrationId },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  async enqueuePendaftaranDelete(registrationId: string): Promise<void> {
    await this.prismaService.bpjsSubmission.upsert({
      where: { registrationId_type: { registrationId, type: 'PENDAFTARAN_DELETE' } },
      create: { registrationId, type: 'PENDAFTARAN_DELETE' },
      update: {},
    });
  }

  async markSubmitted(payload: MarkBpjsSubmissionSubmittedPayload): Promise<void> {
    const settledAt = new Date();
    await this.prismaService.bpjsSubmission.update({
      where: { id: payload.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: settledAt,
        lastAttemptAt: settledAt,
        attempts: { increment: 1 },
        lastError: null,
        bpjsReferenceNo: payload.bpjsReferenceNo,
        submittedKdPoli: payload.submittedKdPoli,
      },
    });
  }

  async scheduleRetry(payload: MarkBpjsSubmissionRetryPayload): Promise<void> {
    await this.prismaService.bpjsSubmission.update({
      where: { id: payload.id },
      data: {
        attempts: payload.attempts,
        nextAttemptAt: payload.nextAttemptAt,
        lastAttemptAt: new Date(),
        lastError: payload.lastError,
      },
    });
  }

  async markFailed(payload: MarkBpjsSubmissionFailedPayload): Promise<void> {
    await this.prismaService.bpjsSubmission.update({
      where: { id: payload.id },
      data: {
        status: 'FAILED',
        attempts: payload.attempts,
        lastAttemptAt: new Date(),
        lastError: payload.lastError,
      },
    });
  }

  private toDoctorData(row: DoctorMappingRow | null): BpjsSubmissionDoctorData | null {
    if (row === null) {
      return null;
    }
    return {
      fullName: row.fullName,
      bpjsDoctorCode: row.bpjsDoctorCode,
      bpjsPoliCode: row.specialty.bpjsPoliCode,
    };
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toRecord(row: BpjsSubmission): BpjsSubmissionRecord {
    return {
      id: row.id,
      registrationId: row.registrationId,
      type: row.type,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      nextAttemptAt: row.nextAttemptAt,
      lastAttemptAt: row.lastAttemptAt,
      submittedAt: row.submittedAt,
      bpjsReferenceNo: row.bpjsReferenceNo,
      submittedKdPoli: row.submittedKdPoli,
      createdAt: row.createdAt,
    };
  }
}
