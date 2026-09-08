import {
  computeLabFlag,
  resolveLabReferenceRange,
  type LabReferenceRangeView,
  type LabResultFlagValue,
  type LabResultRangeSnapshot,
  type LabResultTypeValue,
  type LabWorklistPatient,
} from '@hms/shared-types';

const DAY_IN_MILLISECONDS = 86_400_000;

type PreviewLabFlagParams = {
  resultType: LabResultTypeValue;
  valueNumeric: number | null;
  valueText: string | null;
  valueCoded: string | null;
  /** The catalog's bands for this test, as the tests route lists them. */
  referenceRanges: readonly LabReferenceRangeView[];
  patient: LabWorklistPatient;
  /** When the tube was drawn; null before collection, which no band matches. */
  collectedAt: string | null;
};

export type LabFlagPreview = {
  range: LabResultRangeSnapshot | null;
  flag: LabResultFlagValue | null;
};

/**
 * What the server will flag a value as, before it is saved (P18-T08).
 *
 * The same two functions the API runs at entry — the band picked by sex and
 * age *at collection*, the flag judged against it — on the catalog's current
 * ranges. It agrees with the row the server writes a moment later by
 * construction; if the two ever differed, it is this preview that would be
 * wrong, and it says nothing a saved row does not say back.
 */
export function previewLabFlag(params: PreviewLabFlagParams): LabFlagPreview {
  const range = resolveLabReferenceRange(
    params.referenceRanges.map((view) => ({
      id: view.id,
      sex: view.sex ?? null,
      ageMinDays: view.ageMinDays ?? null,
      ageMaxDays: view.ageMaxDays ?? null,
      low: view.low ?? null,
      high: view.high ?? null,
      criticalLow: view.criticalLow ?? null,
      criticalHigh: view.criticalHigh ?? null,
      textNormal: view.textNormal ?? null,
    })),
    {
      sex: params.patient.sex,
      ageDaysAtCollection: toAgeDays(params.patient.dateOfBirth, params.collectedAt),
    },
  );
  return {
    range,
    flag: computeLabFlag({
      resultType: params.resultType,
      valueNumeric: params.valueNumeric,
      valueText: params.valueText,
      valueCoded: params.valueCoded,
      range,
    }),
  };
}

function toAgeDays(dateOfBirth: string, collectedAt: string | null): number | null {
  if (collectedAt === null) {
    return null;
  }
  const born = new Date(dateOfBirth).getTime();
  const drawn = new Date(collectedAt).getTime();
  if (Number.isNaN(born) || Number.isNaN(drawn)) {
    return null;
  }
  return Math.floor((drawn - born) / DAY_IN_MILLISECONDS);
}
