import type { ListMaternalVisitsDueQuery } from '#maternal-visit-due/schemas';
import type { MaternalDueRange } from '#maternal-visit-due/types';

const MILLISECONDS_PER_DAY = 86_400_000;
/** "Minggu ini" is today and the six days after it, on the clinic's clock. */
export const MATERNAL_DUE_DEFAULT_RANGE_DAYS = 7;

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * The range a due request asks for (P25-T17). A missing `from` is the
 * clinic's today; a missing `to` is six days after `from`, so the default is
 * the rolling week the worklist is named after.
 */
export function resolveMaternalDueRange(params: {
  query: ListMaternalVisitsDueQuery;
  clinicToday: string;
}): MaternalDueRange {
  const from = params.query.from ?? params.clinicToday;
  return { from, to: params.query.to ?? addDays(from, MATERNAL_DUE_DEFAULT_RANGE_DAYS - 1) };
}
