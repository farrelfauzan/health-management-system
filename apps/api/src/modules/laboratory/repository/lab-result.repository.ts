import {
  AmendLabResultPayload,
  EnterLabResultsPayload,
  LabResultRecord,
  ListPatientLabResultsParams,
  PatientLabResultRecord,
  ReleaseLabOrderPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  DecimalRow,
  LabResultEntryItemRow,
  LabResultRow,
  PatientLabResultRow,
} from './lab-result-row.types';

const PATIENT_LAB_RESULT_INCLUDE = {
  labOrderItem: {
    select: {
      labTest: { select: { code: true, name: true, resultType: true } },
      specimen: { select: { collectedAt: true } },
      labOrder: { select: { id: true, orderNumber: true, releasedAt: true } },
    },
  },
};

const LAB_RESULT_ENTRY_ITEM_INCLUDE = {
  labTest: {
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      resultType: true,
      codedOptions: true,
      referenceRanges: true,
    },
  },
  specimen: { select: { collectedAt: true } },
  results: { orderBy: { version: 'asc' as const } },
};

/**
 * Persistence for laboratory results (P18-T04). The only layer that touches
 * Prisma for values, and the one that converts `Decimal` to `number` at the
 * boundary so no Prisma type escapes into the domain — the rule the catalog
 * repository already follows.
 */
@Injectable()
export class LabResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The order's items with everything the flag turns on: the test's result
   * shape, its bands, when the tube was drawn, and any value already entered.
   * One query rather than one per item, because an analis saves a whole
   * worksheet at once.
   */
  async findEntryItemsByOrderId(labOrderId: string): Promise<LabResultEntryItemRow[]> {
    const rows = await this.prisma.labOrderItem.findMany({
      where: { labOrderId },
      orderBy: [{ panelId: 'asc' }, { createdAt: 'asc' }],
      include: LAB_RESULT_ENTRY_ITEM_INCLUDE,
    });

    return rows as unknown as LabResultEntryItemRow[];
  }

  /**
   * Writes the batch and moves the order with it, under one transaction: an
   * item that is resulted but leaves the order in a status that says otherwise
   * is a worklist that lies.
   *
   * Entry only ever writes version 1. A saved-again worksheet re-states the
   * same rows — last write wins per item, which is what two analysts working
   * the same order should do — while versioning is reserved for amendments,
   * which begin only once a value has been released.
   */
  async enterLabResults(payload: EnterLabResultsPayload): Promise<LabResultRecord[]> {
    return this.prisma.executeTransaction(async (tx) => {
      const written: LabResultRow[] = [];
      for (const entry of payload.entries) {
        const row = await tx.labResult.upsert({
          where: {
            labOrderItemId_version: { labOrderItemId: entry.labOrderItemId, version: 1 },
          },
          create: {
            labOrderItemId: entry.labOrderItemId,
            version: 1,
            valueNumeric: entry.valueNumeric,
            valueText: entry.valueText,
            valueCoded: entry.valueCoded,
            unit: entry.unit,
            refLow: entry.refLow,
            refHigh: entry.refHigh,
            refCriticalLow: entry.refCriticalLow,
            refCriticalHigh: entry.refCriticalHigh,
            refText: entry.refText,
            flag: entry.flag,
            enteredById: payload.enteredById,
            enteredAt: payload.enteredAt,
          },
          update: {
            valueNumeric: entry.valueNumeric,
            valueText: entry.valueText,
            valueCoded: entry.valueCoded,
            unit: entry.unit,
            refLow: entry.refLow,
            refHigh: entry.refHigh,
            refCriticalLow: entry.refCriticalLow,
            refCriticalHigh: entry.refCriticalHigh,
            refText: entry.refText,
            flag: entry.flag,
            enteredById: payload.enteredById,
            enteredAt: payload.enteredAt,
          },
        });
        written.push(row as unknown as LabResultRow);
        await tx.labOrderItem.update({
          where: { id: entry.labOrderItemId },
          data: { status: 'RESULTED' },
        });
      }
      const pendingCount = await tx.labOrderItem.count({
        where: { labOrderId: payload.labOrderId, status: 'PENDING' },
      });
      await tx.labOrder.update({
        where: { id: payload.labOrderId },
        data: { status: pendingCount === 0 ? 'RESULTED' : 'IN_PROGRESS' },
      });

      return written.map((row) => this.toLabResultRecord(row));
    });
  }

  /**
   * The second signature, applied to every current value on the order and to
   * the order itself in one transaction. Partial release is not a state this
   * table can hold: a report is signed out whole.
   */
  async releaseLabOrder(payload: ReleaseLabOrderPayload): Promise<LabResultRecord[]> {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.labResult.updateMany({
        where: { labOrderItem: { labOrderId: payload.labOrderId }, verifiedAt: null },
        data: {
          verifiedById: payload.verifiedById,
          verifiedAt: payload.verifiedAt,
          verifiedUnderSingleOperator: payload.verifiedUnderSingleOperator,
        },
      });
      await tx.labOrder.update({
        where: { id: payload.labOrderId },
        data: { status: 'RELEASED', releasedAt: payload.verifiedAt },
      });
      const rows = await tx.labResult.findMany({
        where: { labOrderItem: { labOrderId: payload.labOrderId } },
        orderBy: { version: 'asc' },
      });

      return (rows as unknown as LabResultRow[]).map((row) => this.toLabResultRecord(row));
    });
  }

  /**
   * The correction, written as a new version beside the row it supersedes and
   * released in the same transaction. The superseded row is untouched: a value
   * somebody may have treated a patient on is never edited away.
   */
  async amendLabResult(payload: AmendLabResultPayload): Promise<LabResultRecord> {
    const row = await this.prisma.executeTransaction(async (tx) => {
      const created = await tx.labResult.create({
        data: {
          labOrderItemId: payload.labOrderItemId,
          version: payload.version,
          valueNumeric: payload.valueNumeric,
          valueText: payload.valueText,
          valueCoded: payload.valueCoded,
          unit: payload.unit,
          refLow: payload.refLow,
          refHigh: payload.refHigh,
          refCriticalLow: payload.refCriticalLow,
          refCriticalHigh: payload.refCriticalHigh,
          refText: payload.refText,
          flag: payload.flag,
          enteredById: payload.enteredById,
          enteredAt: payload.enteredAt,
          verifiedById: payload.verifiedById,
          verifiedAt: payload.verifiedAt,
          verifiedUnderSingleOperator: payload.verifiedUnderSingleOperator,
          amendedFromId: payload.amendedFromId,
          amendReason: payload.amendReason,
        },
      });
      await tx.labOrder.update({
        where: { id: payload.labOrderId },
        data: { status: 'RELEASED', releasedAt: payload.verifiedAt },
      });

      return created as unknown as LabResultRow;
    });

    return this.toLabResultRecord(row);
  }

  async findLabResultById(id: string): Promise<LabResultRecord | null> {
    const row = await this.prisma.labResult.findUnique({
      where: { id },
    });

    return row ? this.toLabResultRecord(row as unknown as LabResultRow) : null;
  }

  /** Every value on one order, oldest version first — superseded rows included. */
  async findResultsByOrderId(labOrderId: string): Promise<LabResultRecord[]> {
    const rows = await this.prisma.labResult.findMany({
      where: { labOrderItem: { labOrderId } },
      orderBy: [{ labOrderItemId: 'asc' }, { version: 'asc' }],
    });

    return (rows as unknown as LabResultRow[]).map((row) => this.toLabResultRecord(row));
  }

  /** The item a result hangs off, and the order that owns it. */
  async findOrderIdByResultId(
    id: string,
  ): Promise<{ labOrderId: string; labOrderItemId: string } | null> {
    const row = await this.prisma.labResult.findUnique({
      where: { id },
      select: { labOrderItemId: true, labOrderItem: { select: { labOrderId: true } } },
    });

    return row
      ? { labOrderId: row.labOrderItem.labOrderId, labOrderItemId: row.labOrderItemId }
      : null;
  }

  /** The highest version written for an item, for allocating the next one. */
  async findLatestVersionForItem(labOrderItemId: string): Promise<number> {
    const row = await this.prisma.labResult.findFirst({
      where: { labOrderItemId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return row?.version ?? 0;
  }

  /**
   * The trend feed (P18-T04): released values only, newest first.
   *
   * An unverified number is not a data point. A doctor comparing this month
   * against last must never be shown something nobody has signed, which is why
   * the filter is on the order's release rather than on the result's own
   * timestamps.
   */
  async listPatientLabResults(
    params: ListPatientLabResultsParams,
  ): Promise<PatientLabResultRecord[]> {
    const rows = await this.prisma.labResult.findMany({
      where: {
        verifiedAt: { not: null },
        // The current value only. A superseded version is not a second data
        // point on a trend — it is the number this one replaced.
        amendments: { none: {} },
        labOrderItem: {
          labOrder: {
            patientId: params.patientId,
            status: 'RELEASED',
            ...(params.from || params.to
              ? {
                  releasedAt: {
                    ...(params.from ? { gte: params.from } : {}),
                    ...(params.to ? { lt: params.to } : {}),
                  },
                }
              : {}),
          },
          ...(params.testCode
            ? { labTest: { code: { equals: params.testCode, mode: 'insensitive' as const } } }
            : {}),
        },
      },
      orderBy: { verifiedAt: 'desc' },
      take: params.limit,
      include: PATIENT_LAB_RESULT_INCLUDE,
    });

    return (rows as unknown as PatientLabResultRow[]).map((row) =>
      this.toPatientLabResultRecord(row),
    );
  }

  /**
   * Released values on one visit, for the encounter record. The same rule as
   * the trend feed — released, current version only — narrowed to the
   * encounter the doctor is looking at.
   */
  async listEncounterLabResults(encounterId: string): Promise<PatientLabResultRecord[]> {
    const rows = await this.prisma.labResult.findMany({
      where: {
        verifiedAt: { not: null },
        amendments: { none: {} },
        labOrderItem: { labOrder: { encounterId, status: 'RELEASED' } },
      },
      orderBy: { verifiedAt: 'desc' },
      include: PATIENT_LAB_RESULT_INCLUDE,
    });

    return (rows as unknown as PatientLabResultRow[]).map((row) =>
      this.toPatientLabResultRecord(row),
    );
  }

  /** Whether this account is the patient the results belong to. */
  async isPatientOwner(userId: string, patientId: string): Promise<boolean> {
    const count = await this.prisma.patientProfile.count({
      where: { id: patientId, ownerUserId: userId },
    });

    return count > 0;
  }

  /**
   * The account behind the doctor who ordered the work — who the critical-value
   * bell and the release bell are addressed to. Null when the profile carries
   * no user account, which is a doctor nobody can notify.
   */
  async findOrderingDoctorUserId(labOrderId: string): Promise<string | null> {
    const row = await this.prisma.labOrder.findUnique({
      where: { id: labOrderId },
      select: { orderedBy: { select: { ownerUserId: true } } },
    });

    return row?.orderedBy.ownerUserId ?? null;
  }

  /**
   * Whether this account attends any of the patient's visits — the OWN-scope
   * read rule for the patient-wide trend feed. A doctor sees the history of
   * the people they treat; holding `lab-order.read:own` and no encounter with
   * this patient is not a way into their record.
   */
  async hasEncounterWithPatient(userId: string, patientId: string): Promise<boolean> {
    const count = await this.prisma.encounter.count({
      where: { patientId, doctor: { ownerUserId: userId } },
    });

    return count > 0;
  }

  private toPatientLabResultRecord(row: PatientLabResultRow): PatientLabResultRecord {
    return {
      ...this.toLabResultRecord(row),
      labOrderId: row.labOrderItem.labOrder.id,
      orderNumber: row.labOrderItem.labOrder.orderNumber,
      testCode: row.labOrderItem.labTest.code,
      testName: row.labOrderItem.labTest.name,
      resultType: row.labOrderItem.labTest.resultType,
      collectedAt: row.labOrderItem.specimen?.collectedAt ?? null,
      releasedAt: row.labOrderItem.labOrder.releasedAt,
    };
  }

  toLabResultRecord(row: LabResultRow): LabResultRecord {
    return {
      id: row.id,
      labOrderItemId: row.labOrderItemId,
      version: row.version,
      valueNumeric: this.toNumberOrNull(row.valueNumeric),
      valueText: row.valueText,
      valueCoded: row.valueCoded,
      unit: row.unit,
      refLow: this.toNumberOrNull(row.refLow),
      refHigh: this.toNumberOrNull(row.refHigh),
      refCriticalLow: this.toNumberOrNull(row.refCriticalLow),
      refCriticalHigh: this.toNumberOrNull(row.refCriticalHigh),
      refText: row.refText,
      flag: row.flag,
      enteredById: row.enteredById,
      enteredAt: row.enteredAt,
      verifiedById: row.verifiedById,
      verifiedAt: row.verifiedAt,
      verifiedUnderSingleOperator: row.verifiedUnderSingleOperator,
      amendedFromId: row.amendedFromId,
      amendReason: row.amendReason,
    };
  }

  private toNumberOrNull(value: DecimalRow | null): number | null {
    return value === null ? null : value.toNumber();
  }
}
