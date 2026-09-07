import {
  LabResultRecord,
  LabResultView,
  PatientLabResultRecord,
  PatientLabResultView,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/**
 * Turns result records into the wire shapes, dropping nulls to absent.
 *
 * The reference band travels with every value rather than being looked up by
 * the client: the band shown beside a number has to be the one that number was
 * judged against, and the catalog's current band may be a different band
 * entirely.
 */
@Injectable()
export class LabResultMapper {
  toLabResultView(record: LabResultRecord): LabResultView {
    return {
      id: record.id,
      labOrderItemId: record.labOrderItemId,
      version: record.version,
      valueNumeric: record.valueNumeric ?? undefined,
      valueText: record.valueText ?? undefined,
      valueCoded: record.valueCoded ?? undefined,
      unit: record.unit ?? undefined,
      refLow: record.refLow ?? undefined,
      refHigh: record.refHigh ?? undefined,
      refCriticalLow: record.refCriticalLow ?? undefined,
      refCriticalHigh: record.refCriticalHigh ?? undefined,
      refText: record.refText ?? undefined,
      flag: record.flag ?? undefined,
      enteredById: record.enteredById,
      enteredAt: record.enteredAt.toISOString(),
      verifiedById: record.verifiedById ?? undefined,
      verifiedAt: record.verifiedAt ? record.verifiedAt.toISOString() : undefined,
      verifiedUnderSingleOperator: record.verifiedUnderSingleOperator,
      amendedFromId: record.amendedFromId ?? undefined,
      amendReason: record.amendReason ?? undefined,
    };
  }

  toPatientLabResultView(record: PatientLabResultRecord): PatientLabResultView {
    return {
      ...this.toLabResultView(record),
      labOrderId: record.labOrderId,
      orderNumber: record.orderNumber,
      testCode: record.testCode,
      testName: record.testName,
      resultType: record.resultType,
      collectedAt: record.collectedAt ? record.collectedAt.toISOString() : undefined,
      releasedAt: record.releasedAt ? record.releasedAt.toISOString() : undefined,
    };
  }
}
