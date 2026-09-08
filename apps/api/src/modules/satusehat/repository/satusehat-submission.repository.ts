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
  SatusehatLabReportBundleData,
  SatusehatLabReportResult,
  SatusehatSubmissionKindValue,
  SatusehatSubmissionRecord,
  SatusehatSubmissionStatusValue,
  SaveAllergyIhsIdPayload,
  SaveLabReportIhsIdsPayload,
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
    kind: row.kind,
    encounterId: row.encounter_id,
    labOrderId: row.lab_order_id,
    labOrderNumber: row.lab_order_number,
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

/**
 * The order number is the only thing about a lab order the outbox surfaces —
 * never a value, never a test name. Kept as one include so every read of a
 * submission row returns the same shape.
 */
const SUBMISSION_ORDER_NUMBER_INCLUDE = {
  labOrder: { select: { orderNumber: true } },
} as const;

type SubmissionRowWithOrderNumber = {
  id: string;
  kind: SatusehatSubmissionKindValue;
  encounterId: string | null;
  labOrderId: string | null;
  status: SatusehatSubmissionStatusValue;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  lastAttemptAt: Date | null;
  submittedAt: Date | null;
  satusehatEncounterId: string | null;
  createdAt: Date;
  updatedAt: Date;
  labOrder: { orderNumber: string } | null;
};

/** Flattens the joined order number onto the record the services consume. */
function toSubmissionRecordFromRow(
  row: SubmissionRowWithOrderNumber,
): SatusehatSubmissionRecord {
  const { labOrder, ...rest } = row;
  return { ...rest, labOrderNumber: labOrder?.orderNumber ?? null };
}

const MEDICATION_SELECT = {
  select: { id: true, code: true, kfaCode: true, name: true, unit: true },
} as const;

type LabReportResultRow = {
  id: string;
  valueNumeric: unknown;
  valueText: string | null;
  valueCoded: string | null;
  unit: string | null;
  refLow: unknown;
  refHigh: unknown;
  refText: string | null;
  flag: SatusehatLabReportResult['flag'];
  amendedFromId: string | null;
  enteredAt: Date;
  verifiedAt: Date | null;
};

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
    isCompound: boolean;
    compoundName: string | null;
    preparation: 'PUYER' | 'KAPSUL' | 'SIRUP' | 'SALEP' | 'OTHER' | null;
    medication: MedicationRow | null;
    components: Array<{
      quantity: { toNumber: () => number };
      unit: string;
      medication: MedicationRow;
    }>;
  }>;
  dispenseRecords: Array<{
    id: string;
    dispensedAt: Date;
    items: Array<{
      id: string;
      quantity: number;
      prescriptionItemId: string | null;
      medication: MedicationRow | null;
    }>;
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
   *
   * A LAB_REPORT row carries one extra condition (P18-T09): its
   * DiagnosticReport has to reference `Encounter/{ihs}`, so it depends on the
   * sibling ENCOUNTER row for the same encounter. The claim admits it only
   * once that sibling has *settled* — SUBMITTED, so the report can be sent, or
   * FAILED, so it can be parked with a reason an admin can act on.
   *
   * A sibling still PENDING (or not yet written, because the visit is open)
   * leaves the row unclaimed rather than failing it: nothing has gone wrong,
   * the report is simply early, and a later cycle picks it up with no admin
   * action. An order with no encounter at all is due immediately — there is no
   * sibling to wait for, which is the shape P18-T10 introduces.
   */
  async claimDueSubmissions(
    payload: ClaimDueSubmissionsPayload,
  ): Promise<SatusehatSubmissionRecord[]> {
    const leaseSeconds = payload.leaseMs / MILLISECONDS_PER_SECOND;
    const rows = await this.prisma.$queryRaw<ClaimedSubmissionRow[]>`
      UPDATE "satusehat_submissions" AS "claimed"
      SET "next_attempt_at" = now() + make_interval(secs => ${leaseSeconds}::double precision),
          "updated_at" = now()
      WHERE "claimed"."id" IN (
        SELECT "due"."id"
        FROM "satusehat_submissions" AS "due"
        LEFT JOIN "lab_orders" AS "order" ON "order"."id" = "due"."lab_order_id"
        WHERE "due"."status" = 'PENDING'::"SatusehatSubmissionStatus"
          AND "due"."next_attempt_at" <= now()
          AND (
            "due"."kind" = 'ENCOUNTER'::satusehat_submission_kind
            OR "order"."encounter_id" IS NULL
            OR EXISTS (
              SELECT 1
              FROM "satusehat_submissions" AS "sibling"
              WHERE "sibling"."kind" = 'ENCOUNTER'::satusehat_submission_kind
                AND "sibling"."encounter_id" = "order"."encounter_id"
                AND "sibling"."status" IN (
                  'SUBMITTED'::"SatusehatSubmissionStatus",
                  'FAILED'::"SatusehatSubmissionStatus"
                )
            )
          )
        ORDER BY "due"."next_attempt_at" ASC
        LIMIT ${payload.limit}::integer
        FOR UPDATE OF "due" SKIP LOCKED
      )
      RETURNING "claimed"."id", "claimed"."kind", "claimed"."encounter_id",
                "claimed"."lab_order_id",
                (
                  SELECT "numbered"."order_number"
                  FROM "lab_orders" AS "numbered"
                  WHERE "numbered"."id" = "claimed"."lab_order_id"
                ) AS "lab_order_number",
                "claimed"."status", "claimed"."attempts",
                "claimed"."last_error", "claimed"."next_attempt_at",
                "claimed"."last_attempt_at", "claimed"."submitted_at",
                "claimed"."satusehat_encounter_id", "claimed"."created_at",
                "claimed"."updated_at"
    `;
    return rows.map((row) => toSubmissionRecord(row));
  }

  async findSubmissionById(id: string): Promise<SatusehatSubmissionRecord | null> {
    const row = await this.prisma.satusehatSubmission.findUnique({
      where: { id },
      include: SUBMISSION_ORDER_NUMBER_INCLUDE,
    });
    return row === null ? null : toSubmissionRecordFromRow(row);
  }

  /**
   * Every LAB_REPORT row parked because its encounter never reached the
   * platform, re-opened (P18-T09). Retrying the encounter is the admin action
   * that fixes the cause; the reports that were waiting on it should not each
   * need a second click to follow.
   */
  async requeueLabReportsForEncounter(encounterId: string): Promise<number> {
    const result = await this.prisma.satusehatSubmission.updateMany({
      where: { kind: 'LAB_REPORT', status: 'FAILED', labOrder: { encounterId } },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
    });
    return result.count;
  }

  async findSubmissionPage(params: ListSatusehatSubmissionsParams): Promise<SatusehatSubmissionPage> {
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.encounterId ? { encounterId: params.encounterId } : {}),
      ...(params.labOrderId ? { labOrderId: params.labOrderId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.satusehatSubmission.findMany({
        where,
        include: SUBMISSION_ORDER_NUMBER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.satusehatSubmission.count({ where }),
    ]);
    return { items: rows.map((row) => toSubmissionRecordFromRow(row)), total };
  }

  /**
   * Re-opens a settled row for the admin retry surface: back to PENDING, due
   * immediately, with the attempt budget reset so a fixed root cause gets the
   * full backoff schedule again. The previous lastError is kept until the next
   * attempt overwrites it, so the retry decision stays explainable.
   */
  async requeueSubmission(id: string): Promise<SatusehatSubmissionRecord> {
    const row = await this.prisma.satusehatSubmission.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
      include: SUBMISSION_ORDER_NUMBER_INCLUDE,
    });
    return toSubmissionRecordFromRow(row);
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
        immunizations: {
          where: { deletedAt: null },
          orderBy: { occurredAt: 'asc' },
          select: {
            id: true,
            occurredAt: true,
            lotNumber: true,
            expirationDate: true,
            doseNumber: true,
            route: true,
            site: true,
            notes: true,
            medication: { select: { name: true, kfaCode: true } },
          },
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
                isCompound: true,
                compoundName: true,
                preparation: true,
                medication: MEDICATION_SELECT,
                components: {
                  orderBy: { createdAt: 'asc' },
                  select: {
                    quantity: true,
                    unit: true,
                    medication: MEDICATION_SELECT,
                  },
                },
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
                  select: {
                    id: true,
                    quantity: true,
                    prescriptionItemId: true,
                    medication: MEDICATION_SELECT,
                  },
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
      immunizations: encounter.immunizations.map((immunization) => ({
        immunizationId: immunization.id,
        kfaCode: immunization.medication.kfaCode,
        vaccineName: immunization.medication.name,
        occurredAt: immunization.occurredAt,
        lotNumber: immunization.lotNumber,
        // Date-only on the wire: an expiry is a calendar fact, and an instant
        // would put a timezone on something that does not have one.
        expirationDate: immunization.expirationDate
          ? immunization.expirationDate.toISOString().slice(0, 10)
          : null,
        doseNumber: immunization.doseNumber,
        route: immunization.route,
        site: immunization.site,
        notes: immunization.notes,
      })),
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
        medication: item.medication ? this.toSubmissionMedication(item.medication) : null,
        compound: item.isCompound
          ? {
              compoundName: item.compoundName ?? 'Racikan',
              preparation: item.preparation,
              components: item.components.map((component) => ({
                medication: this.toSubmissionMedication(component.medication),
                quantity: component.quantity.toNumber(),
                unit: component.unit,
              })),
            }
          : null,
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
        medication: item.medication ? this.toSubmissionMedication(item.medication) : null,
        prescriptionItemId: item.prescriptionItemId,
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
  /**
   * Everything the lab chain is built from, read fresh at submission time the
   * way the encounter bundle is (P18-T09). No payload snapshot is stored, so a
   * correction landed before the worker reaches the row is the version that
   * gets reported — which is the behaviour a clinician expects from a system
   * that lets values be amended.
   *
   * `satusehatEncounterId` comes from the encounter's own outbox row: it is
   * the national id the DiagnosticReport must reference, and its absence is
   * exactly the condition the claim gate exists to catch.
   */
  async findLabReportBundleData(labOrderId: string): Promise<SatusehatLabReportBundleData | null> {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        registration: { select: { id: true, registeredAt: true } },
        patient: { select: { id: true, fullName: true, satusehatPatientIdCiphertext: true } },
        orderedBy: { select: { id: true, fullName: true, satusehatPractitionerId: true } },
        encounter: {
          select: {
            id: true,
            diagnoses: {
              where: { deletedAt: null, type: 'PRIMARY' },
              orderBy: { recordedAt: 'asc' },
              take: 1,
              select: { code: true, display: true },
            },
            satusehatSubmissions: {
              where: { kind: 'ENCOUNTER' },
              take: 1,
              select: { satusehatEncounterId: true },
            },
          },
        },
        specimens: {
          where: { status: { not: 'REJECTED' } },
          orderBy: { collectedAt: 'asc' },
          select: {
            id: true,
            specimenType: true,
            accessionNumber: true,
            collectedAt: true,
          },
        },
        items: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            specimenId: true,
            labTest: { select: { name: true, loincCode: true, loincDisplay: true } },
            results: {
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                id: true,
                valueNumeric: true,
                valueText: true,
                valueCoded: true,
                unit: true,
                refLow: true,
                refHigh: true,
                refText: true,
                flag: true,
                amendedFromId: true,
                enteredAt: true,
                verifiedAt: true,
              },
            },
          },
        },
      },
    });
    if (order === null) {
      return null;
    }
    const primaryDiagnosis = order.encounter?.diagnoses[0] ?? null;
    return {
      labOrderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      orderedAt: order.orderedAt,
      releasedAt: order.releasedAt,
      encounterId: order.encounterId,
      satusehatEncounterId:
        order.encounter?.satusehatSubmissions[0]?.satusehatEncounterId ?? null,
      registrationId: order.registrationId,
      visitStartedAt: order.registration.registeredAt,
      patientId: order.patient.id,
      patientName: order.patient.fullName,
      patientIhsNumber: this.decryptOptional(order.patient.satusehatPatientIdCiphertext),
      // Null for a walk-in or an outside referral (P18-T10): nobody at this
      // clinic ordered it, and the chain reports the Organization as performer
      // with no `requester` rather than naming a doctor who did not ask.
      doctorId: order.orderedBy?.id ?? null,
      doctorName: order.orderedBy?.fullName ?? null,
      practitionerIhsNumber: order.orderedBy?.satusehatPractitionerId ?? null,
      // Always null today: `LabPanel` carries a local catalog code and a name,
      // but no LOINC — P18-T01 gave tests one and panels none. Every report
      // therefore codes as LOINC 11502-2 "Laboratory report", which is the
      // fallback P18-T09 specifies for a mixed order and is not wrong for a
      // single-panel one, merely less specific. The mapper already accepts a
      // panel LOINC, so giving the catalog one is a single change here.
      singlePanelLoincCode: null,
      singlePanelLoincDisplay: null,
      primaryConditionCode: primaryDiagnosis?.code ?? null,
      primaryConditionDisplay: primaryDiagnosis?.display ?? null,
      specimens: order.specimens.map((specimen) => ({
        specimenId: specimen.id,
        specimenType: specimen.specimenType,
        accessionNumber: specimen.accessionNumber,
        collectedAt: specimen.collectedAt,
      })),
      items: order.items.map((item, index) => ({
        labOrderItemId: item.id,
        // 1-based and taken from creation order, which is the order the items
        // were written in and never changes — the ServiceRequest identifier
        // suffix has to survive a resubmission.
        itemSeq: index + 1,
        testName: item.labTest.name,
        loincCode: item.labTest.loincCode,
        loincDisplay: item.labTest.loincDisplay,
        specimenId: item.specimenId,
        result: this.toLabReportResult(item.results[0] ?? null),
      })),
    };
  }

  /**
   * Only a verified value is reportable. An entered-but-unverified row exists
   * on a released order when an item was still being worked, and sending it
   * would publish nationally what the bench has not yet signed off.
   */
  private toLabReportResult(row: LabReportResultRow | null): SatusehatLabReportResult | null {
    if (row === null || row.verifiedAt === null) {
      return null;
    }
    return {
      labResultId: row.id,
      valueNumeric: this.toNumberOrNull(row.valueNumeric),
      valueText: row.valueText,
      valueCoded: row.valueCoded,
      unit: row.unit,
      refLow: this.toNumberOrNull(row.refLow),
      refHigh: this.toNumberOrNull(row.refHigh),
      refText: row.refText,
      flag: row.flag,
      isAmendment: row.amendedFromId !== null,
      enteredAt: row.enteredAt,
    };
  }

  /**
   * The IHS ids the platform assigned, written back so a resubmission updates
   * the same resources rather than creating a second set (P18-T09). One
   * transaction: a partial write-back would leave the order looking reported
   * for some of its tests and not others.
   */
  async saveLabReportIhsIds(payload: SaveLabReportIhsIdsPayload): Promise<void> {
    const itemEntries = Object.entries(payload.serviceRequestIdsByItemId);
    const specimenEntries = Object.entries(payload.specimenIdsBySpecimenId);
    const resultEntries = Object.entries(payload.observationIdsByResultId);
    await this.prisma.executeTransaction(async (tx) => {
      if (payload.diagnosticReportId !== null) {
        await tx.labOrder.update({
          where: { id: payload.labOrderId },
          data: { satusehatDiagnosticReportId: payload.diagnosticReportId },
        });
      }
      for (const [labOrderItemId, satusehatServiceRequestId] of itemEntries) {
        await tx.labOrderItem.update({
          where: { id: labOrderItemId },
          data: { satusehatServiceRequestId },
        });
      }
      for (const [labSpecimenId, satusehatSpecimenId] of specimenEntries) {
        await tx.labSpecimen.update({
          where: { id: labSpecimenId },
          data: { satusehatSpecimenId },
        });
      }
      for (const [labResultId, satusehatObservationId] of resultEntries) {
        await tx.labResult.update({
          where: { id: labResultId },
          data: { satusehatObservationId },
        });
      }
    });
  }

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
