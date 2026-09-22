import { MonthlyKiaReportResponse } from '@hms/shared-types';

import { buildMaternalReportCsv } from './build-maternal-report-csv';
import { buildMaternalReportHeaderRows } from './build-maternal-report-header-rows';
import { resolveMaternalReportTitle } from './resolve-maternal-report-title';

/**
 * The monthly KIA report as CSV (P25-T15): one wide row like the puskesmas
 * sheet — indicator labels as the header row, the month's counts beneath —
 * then the counting rule of each indicator as a second block, so the figure
 * and its definition travel together.
 */
export function buildMonthlyKiaCsv(report: MonthlyKiaReportResponse): string {
  const indicators = [...report.indicators, ...report.antenatalLab];
  return buildMaternalReportCsv([
    ...buildMaternalReportHeaderRows(resolveMaternalReportTitle('monthly-kia'), report.header),
    [],
    indicators.map((indicator) => indicator.label),
    indicators.map((indicator) => String(indicator.value)),
    [],
    ['Indikator', 'Definisi'],
    ...indicators.map((indicator) => [indicator.label, indicator.definition]),
  ]);
}
