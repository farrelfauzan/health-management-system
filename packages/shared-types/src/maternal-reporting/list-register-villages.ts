import { MATERNAL_REPORT_LABELS } from '#maternal-reporting/maternal-report-labels';
import type { KohortRegisterRow, MaternalReportVillageOption } from '#maternal-reporting/types';

/** Every village the month's rows name, once each, for the register's picker. */
export function listRegisterVillages(
  rows: readonly KohortRegisterRow[],
): MaternalReportVillageOption[] {
  const byCode = new Map<string, MaternalReportVillageOption>();
  let hasRowsWithoutVillage = false;
  for (const row of rows) {
    if (row.villageCode === null) {
      hasRowsWithoutVillage = true;
      continue;
    }
    byCode.set(row.villageCode, {
      code: row.villageCode,
      name: row.villageName ?? row.villageCode,
    });
  }
  const villages = [...byCode.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'id'),
  );
  return hasRowsWithoutVillage
    ? [...villages, { code: null, name: MATERNAL_REPORT_LABELS.noVillage }]
    : villages;
}
