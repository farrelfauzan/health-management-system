import { FAMILY_PLANNING_DEFAULT_INTERVAL_DAYS } from '#maternal-care/family-planning-intervals';
import type { ContraceptiveMethodValue } from '#maternal-care/family-planning-schemas';

const ONE_DAY_IN_MILLISECONDS = 86_400_000;

/**
 * The next due date of a KB start or service, as `YYYY-MM-DD` or null
 * (P25-T14):
 *
 * - a condom never has one, whatever was entered;
 * - a date the clinician entered (or an explicit `null`) wins over the default;
 * - otherwise the method's sourced default interval from `servedOn`, which is
 *   `null` for IUD and implant, whose control dates are always entered.
 */
export function resolveFamilyPlanningNextDueDate(params: {
  method: ContraceptiveMethodValue;
  servedOn: string;
  enteredNextDueOn?: string | null;
}): string | null {
  if (params.method === 'CONDOM') {
    return null;
  }
  if (params.enteredNextDueOn !== undefined) {
    return params.enteredNextDueOn;
  }
  const intervalDays = FAMILY_PLANNING_DEFAULT_INTERVAL_DAYS[params.method];
  if (intervalDays === null) {
    return null;
  }
  const servedAt = Date.parse(`${params.servedOn}T00:00:00.000Z`);
  return new Date(servedAt + intervalDays * ONE_DAY_IN_MILLISECONDS).toISOString().slice(0, 10);
}
