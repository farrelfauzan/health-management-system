import { LabResultFlagValue, LabResultTypeValue } from '@hms/shared-types';

/**
 * Persistence-shaped rows for lab results — the include shapes the result
 * repository asks Prisma for. Adapter internals, and therefore in `apps/api`
 * rather than in `@hms/shared-types`, the same exception
 * `lab-order-row.types.ts` takes.
 */
export type DecimalRow = { toNumber: () => number };

export type LabResultRow = {
  id: string;
  labOrderItemId: string;
  version: number;
  valueNumeric: DecimalRow | null;
  valueText: string | null;
  valueCoded: string | null;
  unit: string | null;
  refLow: DecimalRow | null;
  refHigh: DecimalRow | null;
  refCriticalLow: DecimalRow | null;
  refCriticalHigh: DecimalRow | null;
  refText: string | null;
  flag: LabResultFlagValue | null;
  enteredById: string;
  enteredAt: Date;
  verifiedById: string | null;
  verifiedAt: Date | null;
  verifiedUnderSingleOperator: boolean;
  amendedFromId: string | null;
  amendReason: string | null;
};

/** A result with the order and test it belongs to, for the patient trend feed. */
export type PatientLabResultRow = LabResultRow & {
  labOrderItem: {
    labTest: { code: string; name: string; resultType: LabResultTypeValue };
    specimen: { collectedAt: Date } | null;
    labOrder: { id: string; orderNumber: string; releasedAt: Date | null };
  };
};

/**
 * One item as result entry needs it: the test's result shape, the band it is
 * judged against, and when the tube was drawn — everything the flag turns on,
 * read in one query rather than one per item.
 */
export type LabResultEntryItemRow = {
  id: string;
  status: 'PENDING' | 'RESULTED' | 'CANCELLED';
  labTest: {
    id: string;
    code: string;
    name: string;
    unit: string | null;
    resultType: LabResultTypeValue;
    codedOptions: string[];
    referenceRanges: {
      id: string;
      sex: 'MALE' | 'FEMALE' | null;
      ageMinDays: number | null;
      ageMaxDays: number | null;
      low: DecimalRow | null;
      high: DecimalRow | null;
      criticalLow: DecimalRow | null;
      criticalHigh: DecimalRow | null;
      textNormal: string | null;
    }[];
  };
  specimen: { collectedAt: Date } | null;
  results: LabResultRow[];
};
