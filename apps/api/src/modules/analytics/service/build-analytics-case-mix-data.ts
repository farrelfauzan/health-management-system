import {
  listAnalyticsBuckets,
  suppressSmallCells,
  type AnalyticsCaseMixData,
  type AnalyticsCaseMixDiagnosis,
  type AnalyticsCaseMixGroup,
  type AnalyticsCaseMixPeriodSnapshot,
  type AnalyticsCaseMixPoliCoding,
  type AnalyticsCaseMixProcedure,
  type AnalyticsCaseMixRowKind,
  type AnalyticsCaseMixSeriesPoint,
  type AnalyticsCaseMixTotals,
  type AnalyticsCodeCountRow,
  type AnalyticsCount,
  type BuildAnalyticsCaseMixDataParams,
} from '@hms/shared-types';

const TOP_CODES = 10;
const TOP_GROUPS = 5;
const PERCENT = 100;
const ONE_DECIMAL = 10;

type RankedCell = {
  kind: AnalyticsCaseMixRowKind;
  key: string | null;
  name: string | null;
  others?: number;
  count: number;
};

function toPercent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * PERCENT * ONE_DECIMAL) / ONE_DECIMAL : null;
}

/** The share of a count that is shown; a withheld count has none, or it would give itself away. */
function toShare(count: AnalyticsCount, whole: number): number | null {
  return typeof count === 'number' ? toPercent(count, whole) : null;
}

/**
 * The top rows, one row for everything below them, and the uncoded
 * encounters, so the list adds up to every finished encounter. Suppression
 * runs over the whole list: with one row hidden the next smallest is hidden
 * too, and no hidden count can be worked out from the total.
 */
function rankWithRemainder(
  rows: readonly AnalyticsCodeCountRow[],
  limit: number,
  uncoded: number,
): RankedCell[] {
  const rest = rows.slice(limit);
  const cells: RankedCell[] = rows
    .slice(0, limit)
    .map((row) => ({ kind: 'CODE', key: row.code, name: row.name, count: row.count }));
  if (rest.length > 0) {
    cells.push({
      kind: 'OTHER',
      key: null,
      name: null,
      others: rest.length,
      count: rest.reduce((total, row) => total + row.count, 0),
    });
  }
  if (uncoded > 0) {
    cells.push({ kind: 'UNCODED', key: null, name: null, count: uncoded });
  }
  return cells;
}

function buildTotals(period: AnalyticsCaseMixPeriodSnapshot): AnalyticsCaseMixTotals {
  const { finishedEncounters, codedEncounters, distinctCodes } = period.snapshot.totals;
  return {
    finishedEncounters,
    codedEncounters,
    uncodedEncounters: finishedEncounters - codedEncounters,
    codingCompletenessPercent: toPercent(codedEncounters, finishedEncounters),
    distinctCodes,
  };
}

function buildSeries(period: AnalyticsCaseMixPeriodSnapshot): AnalyticsCaseMixSeriesPoint[] {
  const byBucket = new Map(period.snapshot.buckets.map((row) => [row.bucket, row]));
  return listAnalyticsBuckets(period.range, period.range.granularity).map((bucket) => ({
    bucket,
    finishedEncounters: byBucket.get(bucket)?.finishedEncounters ?? 0,
    codedEncounters: byBucket.get(bucket)?.codedEncounters ?? 0,
  }));
}

function buildTopDiagnoses(
  period: AnalyticsCaseMixPeriodSnapshot,
  totals: AnalyticsCaseMixTotals,
): AnalyticsCaseMixDiagnosis[] {
  const cells = rankWithRemainder(period.snapshot.diagnoses, TOP_CODES, totals.uncodedEncounters);
  return suppressSmallCells({ cells }).map((cell) => ({
    kind: cell.kind,
    code: cell.key,
    name: cell.name,
    ...(cell.others === undefined ? {} : { otherCodes: cell.others }),
    count: cell.count,
    sharePercent: toShare(cell.count, totals.finishedEncounters),
  }));
}

function buildGroups(
  period: AnalyticsCaseMixPeriodSnapshot,
  totals: AnalyticsCaseMixTotals,
): AnalyticsCaseMixGroup[] {
  const rows = period.snapshot.groups.map((row) => ({
    code: row.group,
    name: null,
    count: row.count,
  }));
  const cells = rankWithRemainder(rows, TOP_GROUPS, totals.uncodedEncounters);
  return suppressSmallCells({ cells }).map((cell) => ({
    kind: cell.kind,
    group: cell.key,
    ...(cell.others === undefined ? {} : { otherGroups: cell.others }),
    count: cell.count,
    sharePercent: toShare(cell.count, totals.finishedEncounters),
  }));
}

/**
 * Uncoded encounters per poli, suppressed like any clinical count. The
 * poli's completeness goes with it when it is withheld: finished encounters
 * and a percentage would give the hidden count straight back.
 */
function buildCodingByPoli(period: AnalyticsCaseMixPeriodSnapshot): AnalyticsCaseMixPoliCoding[] {
  const cells = period.snapshot.poli.map((row) => ({
    ...row,
    count: row.finishedEncounters - row.codedEncounters,
  }));
  return suppressSmallCells({ cells }).map((cell) => ({
    specialtyId: cell.specialtyId,
    specialtyName: cell.specialtyName,
    finishedEncounters: cell.finishedEncounters,
    uncodedEncounters: cell.count,
    codingCompletenessPercent:
      typeof cell.count === 'number'
        ? toPercent(cell.codedEncounters, cell.finishedEncounters)
        : null,
  }));
}

function buildTopProcedures(period: AnalyticsCaseMixPeriodSnapshot): AnalyticsCaseMixProcedure[] {
  const cells = rankWithRemainder(period.snapshot.procedures, TOP_CODES, 0);
  return suppressSmallCells({ cells }).map((cell) => ({
    kind: cell.kind === 'OTHER' ? 'OTHER' : 'CODE',
    code: cell.key,
    name: cell.name,
    ...(cell.others === undefined ? {} : { otherCodes: cell.others }),
    count: cell.count,
  }));
}

/**
 * Shapes the case-mix snapshots into the response (P29-T12). Totals are
 * exact; every breakdown that counts diagnoses or procedures is suppressed
 * below five (Q-6) so no figure can point at a patient (Q-1).
 */
export function buildAnalyticsCaseMixData({
  current,
  comparison,
}: BuildAnalyticsCaseMixDataParams): AnalyticsCaseMixData {
  const totals = buildTotals(current);
  const data: AnalyticsCaseMixData = {
    totals,
    series: buildSeries(current),
    breakdowns: {
      topDiagnoses: buildTopDiagnoses(current, totals),
      groups: buildGroups(current, totals),
      codingByPoli: buildCodingByPoli(current),
      topProcedures: buildTopProcedures(current),
    },
  };
  if (!comparison) {
    return data;
  }
  return {
    ...data,
    comparison: {
      from: comparison.range.from,
      to: comparison.range.to,
      totals: buildTotals(comparison),
      series: buildSeries(comparison),
    },
  };
}
