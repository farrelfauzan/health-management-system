import {
  ClaimDueSubmissionsPayload,
  ListSatusehatSubmissionsParams,
  MarkSubmissionFailedPayload,
  MarkSubmissionRetryPayload,
  SatusehatSubmissionAllergy,
  SatusehatSubmissionBundleData,
  SatusehatSubmissionDispenseItem,
  SatusehatSubmissionMedication,
  SatusehatSubmissionAdmission,
  SatusehatSubmissionPage,
  SatusehatSubmissionPrescription,
  SatusehatSubmissionProcedure,
  SatusehatSubmissionRecord,
  SaveAllergyIhsIdPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClaimedSubmissionRow } from './claimed-submission-row.types';

const MILLISECONDS_PER_SECOND = 1000;

/** Renames one claimed row onto the camel-case record the services consume. */
function toSubmissionRecord(row: ClaimedSubmissionRow): SatusehatSubmissionRecord {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    submittedAt: row.submitted_at,
    satusehatEncounterId: row.satusehat_encounter_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MEDICATION_SELECT = {
  select: { id: true, code: true, kfaCode: true, name: true, unit: true },
} as const;

type MedicationRow = {
  id: string;
  code: string;
  kfaCode: string | null;
  name: string;
  unit: string | null;
};

/**
 * The query behind this row deliberately fetches two disjoint sets in one
 * pass: allergies not yet reported (live, no IHS id), which are what the
 * bundle appends, and allergies reported then retracted (deleted, with an IHS
 * id), which are only counted so the divergence from the platform is logged.
 */
type AllergyRow = {
  id: string;
  substance: string;
  reaction: string | null;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  satusehatAllergyId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
};

type ProcedureRow = {
  id: string;
  icd9cmCodeId: string | null;
  code: string;
  display: string;
  performedAt: Date;
  notes: string | null;
};

type PrescriptionRow = {
  id: string;
  issuedAt: Date | null;
  items: Array<{
    id: string;
    dosage: string;
    frequency: string;
    instructions: string | null;
    quantity: number;
    medication: MedicationRow;
  }>;
  dispenseRecords: Array<{
    id: string;
    dispensedAt: Date;
    items: Array<{ id: string; quantity: number; medication: MedicationRow }>;
  }>;
};

/**
 * Persistence for the SATUSEHAT submission outbox. Rows are created by the
 * EMR close transaction; this repository owns claiming due work, recording
 * outcomes, and assembling the bundle data — including decrypting the sealed
 * patient IHS number, which must never leave the repository as ciphertext.
 */
@Injectable()
export class SatusehatSubmissionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: NationalIdentifierCryptoService,
  ) {}

  /**
   * Claims up to `limit` due rows for this worker and returns them. Selecting
   * and updating in one statement is what makes running more than one API
   * instance safe: `FOR UPDATE SKIP LOCKED` hands each row to exactly one
   * concurrent claimer instead of letting both read it and submit the same
   * encounter to Kemenkes twice.
   *
   * The claim is a lease, not a status change: `nextAttemptAt` is pushed
   * `leaseMs` into the future, so the row stops being due for anyone else while
   * this worker holds it. A worker that dies mid-batch therefore releases its
   * rows when the lease lapses, with no reaper and no half-processed state to
   * clean up — the same "backoff lives in the table" property the outbox
   * already relies on across restarts. The real outcome overwrites the lease:
   * success marks the row SUBMITTED, a transient failure reschedules it on the
   * backoff, a permanent one settles it FAILED.
   */
  async claimDueSubmissions(
    payload: ClaimDueSubmissionsPayload,
  ): Promise<SatusehatSubmissionRecord[]> {
    const leaseSeconds = payload.leaseMs / MILLISECONDS_PER_SECOND;
    const rows = await this.prisma.$queryRaw<ClaimedSubmissionRow[]>`
      UPDATE "satusehat_submissions"
      SET "next_attempt_at" = now() + make_interval(secs => ${leaseSeconds}::double precision),
          "updated_at" = now()
      WHERE "id" IN (
        SELECT "id"
        FROM "satusehat_submissions"
        WHERE "status" = 'PENDING'::"SatusehatSubmissionStatus"
          AND "next_attempt_at" <= now()
        ORDER BY "next_attempt_at" ASC
        LIMIT ${payload.limit}::integer
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "encounter_id", "status", "attempts", "last_error",
                "next_attempt_at", "last_attempt_at", "submitted_at",
                "satusehat_encounter_id", "created_at", "updated_at"
    `;
    return rows.map((row) => toSubmissionRecord(row));
  }

  async findSubmissionById(id: string): Promise<SatusehatSubmissionRecord | null> {
    return this.prisma.satusehatSubmission.findUnique({ where: { id } });
  }

  async findSubmissionPage(params: ListSatusehatSubmissionsParams): Promise<SatusehatSubmissionPage> {
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.encounterId ? { encounterId: params.encounterId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.satusehatSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.satusehatSubmission.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Re-opens a settled row for the admin retry surface: back to PENDING, due
   * immediately, with the attempt budget reset so a fixed root cause gets the
   * full backoff schedule again. The previous lastError is kept until the next
   * attempt overwrites it, so the retry decision stays explainable.
   */
  async requeueSubmission(id: string): Promise<SatusehatSubmissionRecord> {
    return this.prisma.satusehatSubmission.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
    });
  }

  async findBundleData(encounterId: string): Promise<SatusehatSubmissionBundleData | null> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        registration: { select: { checkedInAt: true } },
        patient: {
          select: {
            id: true,
            fullName: true,
            satusehatPatientIdCiphertext: true,
            allergies: {
              where: {
                OR: [
                  { deletedAt: null, satusehatAllergyId: null },
                  { deletedAt: { not: null }, satusehatAllergyId: { not: null } },
                ],
              },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                substance: true,
                reaction: true,
                severity: true,
                satusehatAllergyId: true,
                deletedAt: true,
                createdAt: true,
              },
            },
          },
        },
        doctor: { select: { id: true, fullName: true, satusehatPractitionerId: true } },
        diagnoses: {
          where: { deletedAt: null },
          orderBy: { recordedAt: 'asc' },
          select: { code: true, display: true, type: true, recordedAt: true },
        },
        admissions: {
          where: { deletedAt: null, status: 'DISCHARGED', dischargedAt: { not: null } },
          orderBy: { admittedAt: 'desc' },
          take: 1,
          select: { id: true, admittedAt: true, dischargedAt: true },
        },
        procedures: {
          where: { deletedAt: null },
          orderBy: { performedAt: 'asc' },
          select: {
            id: true,
            icd9cmCodeId: true,
            code: true,
            display: true,
            performedAt: true,
            notes: true,
          },
        },
        vitalSigns: {
          where: { deletedAt: null },
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
        prescriptions: {
          where: {
            deletedAt: null,
            status: { in: ['ISSUED', 'PARTIALLY_DISPENSED', 'DISPENSED'] },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            issuedAt: true,
            items: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                dosage: true,
                frequency: true,
                instructions: true,
                quantity: true,
                medication: MEDICATION_SELECT,
              },
            },
            dispenseRecords: {
              where: { status: 'DISPENSED' },
              orderBy: { dispensedAt: 'asc' },
              select: {
                id: true,
                dispensedAt: true,
                items: {
                  orderBy: { createdAt: 'asc' },
                  select: { id: true, quantity: true, medication: MEDICATION_SELECT },
                },
              },
            },
          },
        },
      },
    });
    if (!encounter) {
      return null;
    }
    const latestVitals = encounter.vitalSigns[0];
    return {
      encounterId: encounter.id,
      encounterStatus: encounter.status,
      patientId: encounter.patient.id,
      patientName: encounter.patient.fullName,
      patientIhsNumber: this.decryptOptional(encounter.patient.satusehatPatientIdCiphertext),
      doctorId: encounter.doctor.id,
      doctorName: encounter.doctor.fullName,
      practitionerIhsNumber: encounter.doctor.satusehatPractitionerId,
      arrivedAt: encounter.registration.checkedInAt ?? encounter.startedAt,
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      soapNote: {
        subjective: encounter.subjective,
        objective: encounter.objective,
        assessment: encounter.assessment,
        plan: encounter.plan,
        prognosis: encounter.prognosis,
      },
      admission: this.toSubmissionAdmission(encounter.admissions[0]),
      diagnoses: encounter.diagnoses,
      procedures: encounter.procedures.map((procedure) => this.toSubmissionProcedure(procedure)),
      unreportedAllergies: encounter.patient.allergies
        .filter((allergy) => allergy.deletedAt === null)
        .map((allergy) => this.toSubmissionAllergy(allergy)),
      retractedReportedAllergyCount: encounter.patient.allergies.filter(
        (allergy) => allergy.deletedAt !== null,
      ).length,
      latestVitalSigns: latestVitals
        ? {
            recordedAt: latestVitals.recordedAt,
            heightCm: this.toNumberOrNull(latestVitals.heightCm),
            weightKg: this.toNumberOrNull(latestVitals.weightKg),
            systolicBloodPressure: latestVitals.systolicBloodPressure,
            diastolicBloodPressure: latestVitals.diastolicBloodPressure,
            pulseRate: latestVitals.pulseRate,
            respiratoryRate: latestVitals.respiratoryRate,
            temperatureCelsius: this.toNumberOrNull(latestVitals.temperatureCelsius),
            oxygenSaturation: latestVitals.oxygenSaturation,
          }
        : null,
      prescriptions: encounter.prescriptions.map((prescription) =>
        this.toSubmissionPrescription(prescription),
      ),
      dispenseItems: encounter.prescriptions.flatMap((prescription) =>
        this.toSubmissionDispenseItems(prescription),
      ),
    };
  }

  /**
   * `recordedAt` is the row's `createdAt`: the record has no separate
   * "recorded on" column, and the moment the clinic wrote the allergy down is
   * exactly what `AllergyIntolerance.recordedDate` means.
   */
  private toSubmissionAllergy(allergy: AllergyRow): SatusehatSubmissionAllergy {
    return {
      allergyId: allergy.id,
      substance: allergy.substance,
      reaction: allergy.reaction,
      severity: allergy.severity,
      recordedAt: allergy.createdAt,
    };
  }

  /**
   * Only a discharged stay is reported as inpatient. An admission still open
   * has no episode end to report, and a cancelled one is a stay that never
   * happened — both leave the visit ambulatory (P10-T09).
   */
  private toSubmissionAdmission(
    admission: { id: string; admittedAt: Date; dischargedAt: Date | null } | undefined,
  ): SatusehatSubmissionAdmission | null {
    if (admission === undefined || admission.dischargedAt === null) {
      return null;
    }
    return {
      admissionId: admission.id,
      admittedAt: admission.admittedAt,
      dischargedAt: admission.dischargedAt,
    };
  }

  /**
   * A procedure without an `icd9cmCodeId` was typed as free text; the code
   * column then holds whatever the doctor wrote, which is not an ICD-9-CM
   * code. The flag lets the submission service skip and gap-report it instead
   * of sending an unrecognised coding (P10-T07).
   */
  private toSubmissionProcedure(procedure: ProcedureRow): SatusehatSubmissionProcedure {
    return {
      procedureId: procedure.id,
      code: procedure.code,
      display: procedure.display,
      isCoded: procedure.icd9cmCodeId !== null,
      performedAt: procedure.performedAt,
      notes: procedure.notes,
    };
  }

  private toSubmissionPrescription(prescription: PrescriptionRow): SatusehatSubmissionPrescription {
    return {
      prescriptionId: prescription.id,
      issuedAt: prescription.issuedAt,
      items: prescription.items.map((item) => ({
        prescriptionItemId: item.id,
        prescriptionId: prescription.id,
        medication: this.toSubmissionMedication(item.medication),
        dosage: item.dosage,
        frequency: item.frequency,
        instructions: item.instructions,
        quantity: item.quantity,
      })),
    };
  }

  private toSubmissionDispenseItems(
    prescription: PrescriptionRow,
  ): SatusehatSubmissionDispenseItem[] {
    return prescription.dispenseRecords.flatMap((dispenseRecord) =>
      dispenseRecord.items.map((item) => ({
        dispenseItemId: item.id,
        dispenseRecordId: dispenseRecord.id,
        prescriptionId: prescription.id,
        medication: this.toSubmissionMedication(item.medication),
        quantity: item.quantity,
        dispensedAt: dispenseRecord.dispensedAt,
      })),
    );
  }

  private toSubmissionMedication(medication: MedicationRow): SatusehatSubmissionMedication {
    return {
      medicationId: medication.id,
      code: medication.code,
      kfaCode: medication.kfaCode,
      name: medication.name,
      unit: medication.unit,
    };
  }

  /**
   * Writes back the IHS ids the platform assigned to newly reported allergies.
   * Called only after the transaction bundle succeeded — a write-back on a
   * failed submission would permanently silence an allergy that never reached
   * the platform, which is the one failure mode worth being careful about
   * here (P10-T08).
   */
  async saveAllergyIhsIds(payloads: readonly SaveAllergyIhsIdPayload[]): Promise<void> {
    if (payloads.length === 0) {
      return;
    }
    await this.prisma.executeTransaction(async (tx) => {
      for (const payload of payloads) {
        await tx.patientAllergy.update({
          where: { id: payload.allergyId },
          data: { satusehatAllergyId: payload.satusehatAllergyId },
        });
      }
    });
  }

  async markSubmitted(id: string, satusehatEncounterId: string | null): Promise<void> {
    const now = new Date();
    await this.prisma.satusehatSubmission.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        lastAttemptAt: now,
        attempts: { increment: 1 },
        lastError: null,
        satusehatEncounterId,
      },
    });
  }

  async scheduleRetry(payload: MarkSubmissionRetryPayload): Promise<void> {
    await this.prisma.satusehatSubmission.update({
      where: { id: payload.id },
      data: {
        status: 'PENDING',
        attempts: payload.attempts,
        nextAttemptAt: payload.nextAttemptAt,
        lastAttemptAt: new Date(),
        lastError: payload.lastError,
      },
    });
  }

  async markFailed(payload: MarkSubmissionFailedPayload): Promise<void> {
    await this.prisma.satusehatSubmission.update({
      where: { id: payload.id },
      data: {
        status: 'FAILED',
        attempts: payload.attempts,
        lastAttemptAt: new Date(),
        lastError: payload.lastError,
      },
    });
  }

  private decryptOptional(ciphertext: string | null): string | null {
    return ciphertext === null ? null : this.cryptoService.decryptIdentifier(ciphertext);
  }

  /** `Decimal` measurements become numbers here so no Prisma type escapes the repository. */
  private toNumberOrNull(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
  }
}
