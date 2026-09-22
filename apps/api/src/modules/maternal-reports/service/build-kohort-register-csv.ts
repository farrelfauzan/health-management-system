import { KohortRegisterResponse } from '@hms/shared-types';

import { buildMaternalReportCsv } from './build-maternal-report-csv';
import { buildMaternalReportHeaderRows } from './build-maternal-report-header-rows';
import { resolveMaternalReportTitle } from './resolve-maternal-report-title';

/**
 * One register as CSV (P25-T15): the header block, a blank line, then the
 * configured columns as the header row and every row in village order. The
 * village is in the register's own address column, so the groups need no
 * separator row that would break the sheet.
 */
export function buildKohortRegisterCsv(register: KohortRegisterResponse): string {
  return buildMaternalReportCsv([
    ...buildMaternalReportHeaderRows(
      resolveMaternalReportTitle(register.register),
      register.header,
    ),
    ...(register.villageCode === null
      ? []
      : [['Desa/Kelurahan', register.groups[0]?.villageName ?? register.villageCode]]),
    [],
    register.columns.map((column) => column.label),
    ...register.groups.flatMap((group) => group.rows.map((row) => [...row.values])),
  ]);
}
