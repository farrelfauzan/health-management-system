import type { LabReferenceRangeInput, LabReferenceRangeView } from '@hms/shared-types';

/** One band as the editor holds it: strings, because inputs hold strings. */
export type LabReferenceRangeDraft = {
  key: string;
  sex: '' | 'MALE' | 'FEMALE';
  ageMinDays: string;
  ageMaxDays: string;
  low: string;
  high: string;
  criticalLow: string;
  criticalHigh: string;
  textNormal: string;
};

export type LabReferenceRangeDraftIssue = 'EMPTY' | 'INVALID_NUMBER' | 'AGE_ORDER' | 'RANGE_ORDER';

export type LabReferenceRangeDraftResult =
  | { input: LabReferenceRangeInput; issue?: undefined }
  | { input?: undefined; issue: LabReferenceRangeDraftIssue };

export function createEmptyLabReferenceRangeDraft(key: string): LabReferenceRangeDraft {
  return {
    key,
    sex: '',
    ageMinDays: '',
    ageMaxDays: '',
    low: '',
    high: '',
    criticalLow: '',
    criticalHigh: '',
    textNormal: '',
  };
}

export function toLabReferenceRangeDraft(
  range: LabReferenceRangeView,
  key: string,
): LabReferenceRangeDraft {
  return {
    key,
    sex: range.sex ?? '',
    ageMinDays: toDraftNumber(range.ageMinDays),
    ageMaxDays: toDraftNumber(range.ageMaxDays),
    low: toDraftNumber(range.low),
    high: toDraftNumber(range.high),
    criticalLow: toDraftNumber(range.criticalLow),
    criticalHigh: toDraftNumber(range.criticalHigh),
    textNormal: range.textNormal ?? '',
  };
}

/**
 * The band as the API takes it, or the first thing wrong with it. The order
 * checks repeat the schema's on purpose: the schema reports them against a
 * path inside an array the dialog cannot point a person at, and this names
 * the row.
 */
export function toLabReferenceRangeInput(
  draft: LabReferenceRangeDraft,
): LabReferenceRangeDraftResult {
  const numbers = {
    ageMinDays: parseDraftInteger(draft.ageMinDays),
    ageMaxDays: parseDraftInteger(draft.ageMaxDays),
    low: parseDraftNumber(draft.low),
    high: parseDraftNumber(draft.high),
    criticalLow: parseDraftNumber(draft.criticalLow),
    criticalHigh: parseDraftNumber(draft.criticalHigh),
  };
  if (Object.values(numbers).some((value) => value === 'INVALID')) {
    return { issue: 'INVALID_NUMBER' };
  }
  const parsed = numbers as Record<keyof typeof numbers, number | null>;
  const textNormal = draft.textNormal.trim();
  if (parsed.low === null && parsed.high === null && textNormal === '') {
    return { issue: 'EMPTY' };
  }
  if (
    parsed.ageMinDays !== null &&
    parsed.ageMaxDays !== null &&
    parsed.ageMinDays > parsed.ageMaxDays
  ) {
    return { issue: 'AGE_ORDER' };
  }
  if (parsed.low !== null && parsed.high !== null && parsed.low > parsed.high) {
    return { issue: 'RANGE_ORDER' };
  }
  return {
    input: {
      sex: draft.sex === '' ? null : draft.sex,
      ageMinDays: parsed.ageMinDays,
      ageMaxDays: parsed.ageMaxDays,
      low: parsed.low,
      high: parsed.high,
      criticalLow: parsed.criticalLow,
      criticalHigh: parsed.criticalHigh,
      textNormal: textNormal === '' ? null : textNormal,
    },
  };
}

function toDraftNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** Blank is null; a comma decimal is accepted the way the entry form accepts it. */
function parseDraftNumber(raw: string): number | null | 'INVALID' {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 'INVALID';
}

function parseDraftInteger(raw: string): number | null | 'INVALID' {
  const parsed = parseDraftNumber(raw);
  if (parsed === null || parsed === 'INVALID') {
    return parsed;
  }
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 'INVALID';
}
