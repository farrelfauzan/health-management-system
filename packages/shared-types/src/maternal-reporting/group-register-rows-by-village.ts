import type { KohortRegisterGroup } from '#maternal-reporting/contracts';
import { MATERNAL_REPORT_LABELS } from '#maternal-reporting/maternal-report-labels';
import type { KohortRegisterRow } from '#maternal-reporting/types';

/**
 * Rows grouped by desa/kelurahan, villages in name order and the rows without
 * a recorded village last under "Tanpa desa" (P25-T15). With `villageCode`
 * only that village's group is returned, so a mother without a village is
 * listed only in the unfiltered register. Row numbers restart per group,
 * which is how a register page per desa is read.
 */
export function groupRegisterRowsByVillage(
  rows: readonly KohortRegisterRow[],
  villageCode: string | null,
): KohortRegisterGroup[] {
  const groups = new Map<string | null, KohortRegisterGroup>();
  for (const row of rows) {
    if (villageCode !== null && row.villageCode !== villageCode) {
      continue;
    }
    const group = groups.get(row.villageCode) ?? {
      villageCode: row.villageCode,
      villageName: row.villageName ?? MATERNAL_REPORT_LABELS.noVillage,
      rows: [],
    };
    group.rows.push({ ...row, values: [String(group.rows.length + 1), ...row.values.slice(1)] });
    groups.set(row.villageCode, group);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.villageCode === null) {
      return 1;
    }
    if (right.villageCode === null) {
      return -1;
    }
    return left.villageName.localeCompare(right.villageName, 'id');
  });
}
