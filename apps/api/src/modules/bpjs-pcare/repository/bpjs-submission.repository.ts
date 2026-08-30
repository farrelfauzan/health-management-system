import {
  BpjsAntreanSubmissionSourceData,
  BpjsMonthlyReconciliationData,
  BpjsSubmissionDispensedMedicationData,
  BpjsSubmissionDoctorData,
  BpjsSubmissionPage,
  BpjsSubmissionRecord,
  BpjsSubmissionSiblingRow,
  BpjsSubmissionSourceData,
  BpjsSubmissionStatusValue,
  ClaimDueBpjsSubmissionsPayload,
  ListBpjsSubmissionsParams,
  MarkBpjsSubmissionFailedPayload,
  MarkBpjsSubmissionRetryPayload,
  MarkBpjsSubmissionSubmittedPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsSubmission } from '../../../generated/prisma/client';
import { ClaimedBpjsSubmissionRow } from './claimed-bpjs-submission-row.types';

const MAX_REPORTED_FAILURES = 100;
const MILLISECONDS_PER_SECOND = 1000;

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
 * Due rows are claimed under a lease with `FOR UPDATE SKIP LOCKED` rather
 * than merely read, so more than one API instance can drain this outbox
 * without reporting the same visit to BPJS twice.
 */
@Injectable()
export class BpjsSubmissionRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly identifierCryptoService: NationalIdentifierCryptoService,
  ) {}

  /**
   * Claims up to `limit` due rows for this worker and returns them. Selecting
   * and updating in one statement is what makes running more than one API
   * instance safe: `FOR UPDATE SKIP LOCKED` hands each row to exactly one
   * concurrent claimer instead of letting both read it and report the same
   * visit to BPJS twice (SJ-76, the same defect fixed for the SATUSEHAT outbox).
   *
   * The claim is a lease, not a status change: `nextAttemptAt` is pushed
   * `leaseMs` into the future, so the row stops being due for anyone else while
   * this worker holds it. A worker that dies mid-batch therefore releases its
   * rows when the lease lapses, with no reaper and no half-processed state to
   * clean up — the same "backoff lives in the table" property the outbox
   * already relies on across restarts. The real outcome overwrites the lease:
   * success marks the row SUBMITTED, a transient failure reschedules it on the
   * backoff, a permanent one settles it FAILED.
   *
   * The ordering is `nextAttemptAt` ascending, exactly as the plain read was:
   * the PENDAFTARAN -> KUNJUNGAN -> OBAT sequence is enforced by the sibling
   * checks in the submission service, not by claim order, so a claim that
   * splits a visit's rows across two workers is still correct — the dependent
   * row simply reschedules until its predecessor lands.
   */
  async claimDueSubmissions(
    payload: ClaimDueBpjsSubmissionsPayload,
  ): Promise<BpjsSubmissionRecord[]> {
    const leaseSeconds = payload.leaseMs / MILLISECONDS_PER_SECOND;
    const rows = await this.prismaService.$queryRaw<ClaimedBpjsSubmissionRow[]>`
      UPDATE "bpjs_submissions"
      SET "next_attempt_at" = now() + make_interval(secs => ${leaseSeconds}::double precision),
          "updated_at" = now()
      WHERE "id" IN (
        SELECT "id"
        FROM "bpjs_submissions"
        WHERE "status" = 'PENDING'::"BpjsSubmissionStatus"
          AND "next_attempt_at" <= now()
        ORDER BY "next_attempt_at" ASC
        LIMIT ${payload.limit}::integer
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "registration_id", "type", "status", "attempts", "last_error",
                "next_attempt_at", "last_attempt_at", "submitted_at",
                "bpjs_reference_no", "submitted_kd_poli", "created_at"
    `;
    return rows.map((row) => this.toClaimedRecord(row));
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
        poliQueueNumber: true,
        specialty: { select: { name: true, bpjsPoliCode: true } },
        patient: {
          select: {
            mrn: true,
            phoneNumber: true,
            bpjsNumberCiphertext: true,
            nikCiphertext: true,
          },
        },
        appointment: {
          select: {
            bpjsBookingCode: true,
            doctor: { select: DOCTOR_MAPPING_SELECT },
            session: { select: { sessionDate: true, startTime: true, endTime: true } },
          },
        },
        encounter: {
          select: {
            id: true,
            status: true,
            startedAt: true,
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
            bpjsReferral: {
              select: {
                destinationProviderCode: true,
                subSpecialtyCode: true,
                saranaCode: true,
                khususCode: true,
                estimatedReferralDate: true,
                notes: true,
                deletedAt: true,
              },
            },
            prescriptions: {
              where: { deletedAt: null },
              select: {
                items: { select: { medicationId: true, frequency: true } },
                dispenseRecords: {
                  where: { status: 'DISPENSED' },
                  select: {
                    items: {
                      select: {
                        quantity: true,
                        medicationId: true,
                        medication: { select: { name: true, dphoCode: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        bpjsSubmissions: {
          where: { type: { in: ['PENDAFTARAN', 'KUNJUNGAN', 'ANTREAN_ADD'] } },
          select: { type: true, status: true, bpjsReferenceNo: true, submittedKdPoli: true },
        },
      },
    });
    if (registration === null) {
      return null;
    }
    const latestVitals = registration.encounter?.vitalSigns[0];
    const pendaftaranRow = registration.bpjsSubmissions.find(
      (row) => row.type === 'PENDAFTARAN',
    );
    const kunjunganRow = registration.bpjsSubmissions.find((row) => row.type === 'KUNJUNGAN');
    const antreanAddRow = registration.bpjsSubmissions.find((row) => row.type === 'ANTREAN_ADD');
    const activeReferral =
      registration.encounter?.bpjsReferral?.deletedAt === null
        ? registration.encounter.bpjsReferral
        : null;
    return {
      registration: {
        id: registration.id,
        status: registration.status,
        queueDate: registration.queueDate,
        checkedInAt: registration.checkedInAt,
      },
      patient: {
        bpjsNumber: this.decryptOptionalIdentifier(registration.patient.bpjsNumberCiphertext),
      },
      appointmentDoctor: this.toDoctorData(registration.appointment?.doctor ?? null),
      encounter:
        registration.encounter === null
          ? null
          : {
              id: registration.encounter.id,
              startedAt: registration.encounter.startedAt,
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
              referral:
                activeReferral === null
                  ? null
                  : {
                      destinationProviderCode: activeReferral.destinationProviderCode,
                      subSpecialtyCode: activeReferral.subSpecialtyCode,
                      saranaCode: activeReferral.saranaCode,
                      khususCode: activeReferral.khususCode,
                      estimatedReferralDate: activeReferral.estimatedReferralDate,
                      notes: activeReferral.notes,
                    },
            },
      dispensedMedications: this.collectDispensedMedications(registration.encounter),
      pendaftaran: this.toSiblingRow(pendaftaranRow),
      kunjungan: this.toSiblingRow(kunjunganRow),
      antrean: this.toAntreanData(registration),
      antreanAdd: this.toSiblingRow(antreanAddRow),
    };
  }

  /**
   * The Antrean Online view of the same visit (P14-T05). The doctor is read
   * from the appointment rather than the encounter because `antrean/add` is
   * published at check-in, before any encounter exists — and a walk-in with
   * no appointment legitimately has no doctor, poli, or session, which the
   * submission service refuses with a readable message rather than guessing.
   */
  private toAntreanData(registration: {
    poliQueueNumber: number | null;
    specialty: { name: string; bpjsPoliCode: string | null } | null;
    patient: { mrn: string; phoneNumber: string; nikCiphertext: string | null };
    appointment: {
      bpjsBookingCode: string | null;
      doctor: DoctorMappingRow;
      session: { sessionDate: Date; startTime: string; endTime: string } | null;
    } | null;
  }): BpjsAntreanSubmissionSourceData {
    const session = registration.appointment?.session ?? null;
    return {
      bpjsBookingCode: registration.appointment?.bpjsBookingCode ?? null,
      poliQueueNumber: registration.poliQueueNumber ?? null,
      // The poli denormalised onto the registration (P14-T01) is the anchor of
      // the allocated number, so it wins over the doctor's current specialty:
      // a doctor who later moves poli must not retag yesterday's ticket.
      poliCode:
        registration.specialty?.bpjsPoliCode ??
        registration.appointment?.doctor.specialty.bpjsPoliCode ??
        null,
      poliName: registration.specialty?.name ?? null,
      doctorCode: registration.appointment?.doctor.bpjsDoctorCode ?? null,
      doctorName: registration.appointment?.doctor.fullName ?? null,
      practiceWindow: session === null ? null : `${session.startTime}-${session.endTime}`,
      sessionStart: session === null ? null : session.sessionDate,
      medicalRecordNumber: registration.patient.mrn,
      nationalIdentityNumber: this.decryptOptionalIdentifier(registration.patient.nikCiphertext),
      phoneNumber: registration.patient.phoneNumber,
    };
  }

  /**
   * Decrypts a sealed identifier, treating "absent" and "null" alike.
   *
   * The nullish check is deliberate rather than `=== null`. These columns are
   * nullable, and a projection that does not select one yields `undefined` —
   * which a strict null check waves through into the crypto service, where it
   * fails with an opaque `ERR_INVALID_ARG_TYPE`. That failure surfaced as a
   * *PCare* submission crashing on a field only Antrean reads, which is the
   * worst shape this bug could take: one integration's optional data breaking
   * another integration's send.
   */
  private decryptOptionalIdentifier(ciphertext: string | null | undefined): string | null {
    if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
      return null;
    }
    return this.identifierCryptoService.decryptIdentifier(ciphertext);
  }

  private toSiblingRow(
    row:
      | { status: BpjsSubmissionStatusValue; bpjsReferenceNo: string | null; submittedKdPoli: string | null }
      | undefined,
  ): BpjsSubmissionSiblingRow | null {
    if (row === undefined) {
      return null;
    }
    return {
      status: row.status,
      bpjsReferenceNo: row.bpjsReferenceNo,
      submittedKdPoli: row.submittedKdPoli,
    };
  }

  private collectDispensedMedications(
    encounter: {
      prescriptions: Array<{
        items: Array<{ medicationId: string; frequency: string }>;
        dispenseRecords: Array<{
          items: Array<{
            quantity: number;
            medicationId: string;
            medication: { name: string; dphoCode: string | null };
          }>;
        }>;
      }>;
    } | null,
  ): BpjsSubmissionDispensedMedicationData[] {
    if (encounter === null) {
      return [];
    }
    const dispensedMedications: BpjsSubmissionDispensedMedicationData[] = [];
    for (const prescription of encounter.prescriptions) {
      const frequencyByMedicationId = new Map(
        prescription.items.map((item) => [item.medicationId, item.frequency]),
      );
      for (const dispenseRecord of prescription.dispenseRecords) {
        for (const item of dispenseRecord.items) {
          dispensedMedications.push({
            medicationName: item.medication.name,
            dphoCode: item.medication.dphoCode,
            quantity: item.quantity,
            frequency: frequencyByMedicationId.get(item.medicationId) ?? null,
          });
        }
      }
    }
    return dispensedMedications;
  }

  /**
   * Counts submissions per type and status for visits whose clinic-local day
   * falls in [monthStart, monthEnd), plus the failed rows to chase — the raw
   * material of the tercatat/terkirim/gagal reconciliation. Scoped by the
   * visit's queueDate (checkedInAt fallback for pre-queue rows), not the
   * submission's own timestamps: the claim month is the visit month.
   */
  async findMonthlyReconciliation(
    monthStart: Date,
    monthEnd: Date,
  ): Promise<BpjsMonthlyReconciliationData> {
    const visitMonthFilter = {
      registration: {
        OR: [
          { queueDate: { gte: monthStart, lt: monthEnd } },
          { queueDate: null, checkedInAt: { gte: monthStart, lt: monthEnd } },
        ],
      },
    };
    const [grouped, failureRows] = await this.prismaService.$transaction([
      this.prismaService.bpjsSubmission.groupBy({
        by: ['type', 'status'],
        where: visitMonthFilter,
        _count: { _all: true },
      }),
      this.prismaService.bpjsSubmission.findMany({
        where: { ...visitMonthFilter, status: 'FAILED' },
        orderBy: { lastAttemptAt: 'desc' },
        take: MAX_REPORTED_FAILURES,
      }),
    ]);
    return {
      counts: grouped.map((group) => ({
        type: group.type,
        status: group.status,
        count: group._count._all,
      })),
      failures: failureRows.map((row) => this.toRecord(row)),
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

  /** Renames one claimed row onto the camel-case record the services consume. */
  private toClaimedRecord(row: ClaimedBpjsSubmissionRow): BpjsSubmissionRecord {
    return {
      id: row.id,
      registrationId: row.registration_id,
      type: row.type,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      nextAttemptAt: row.next_attempt_at,
      lastAttemptAt: row.last_attempt_at,
      submittedAt: row.submitted_at,
      bpjsReferenceNo: row.bpjs_reference_no,
      submittedKdPoli: row.submitted_kd_poli,
      createdAt: row.created_at,
    };
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
