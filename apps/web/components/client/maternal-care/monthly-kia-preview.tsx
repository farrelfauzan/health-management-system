'use client';

import type { MonthlyKiaIndicatorValue } from '@hms/shared-types';
import { TableBody, TableCell, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { MaternalReportHeaderLine } from '#components/client/maternal-care/maternal-report-header-line';
import { MaternalReportProvisionalNotice } from '#components/client/maternal-care/maternal-report-provisional-notice';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { useMonthlyKiaReport } from '#lib/maternal-reports/use-monthly-kia-report';

const TABLE_COLUMN_COUNT = 3;

type MonthlyKiaPreviewProps = {
  month: string;
};

/** The monthly KIA indicators and the LB3 laboratory block on screen (P25-T15). */
export function MonthlyKiaPreview({ month }: MonthlyKiaPreviewProps) {
  const t = useTranslations('maternalCare.reports');
  const report = useMonthlyKiaReport(month, true);

  if (report.isError) {
    return <EmptyState icon="error" title={t('loadError')} />;
  }
  if (report.isPending || report.data === undefined) {
    return (
      <DataTable minWidthClassName="min-w-[40rem]">
        <TableBody>
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        </TableBody>
      </DataTable>
    );
  }

  const renderTable = (heading: string, indicators: MonthlyKiaIndicatorValue[]) => (
    <div className="space-y-2">
      <h2 className="font-heading text-sm font-semibold text-slate-900">{heading}</h2>
      <DataTable minWidthClassName="min-w-[40rem]">
        <TableHeader>
          <TableRow>
            <DataTableHeaderCell>{t('indicators.indicator')}</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right">
              {t('indicators.value')}
            </DataTableHeaderCell>
            <DataTableHeaderCell>{t('indicators.definition')}</DataTableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {indicators.map((indicator) => (
            <TableRow key={indicator.id}>
              <TableCell className="text-sm">{indicator.label}</TableCell>
              <TableCell className="text-right font-mono text-sm">{indicator.value}</TableCell>
              <TableCell className="text-xs text-slate-500">{indicator.definition}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </div>
  );

  return (
    <div className="space-y-4">
      <MaternalReportHeaderLine header={report.data.header} />
      {report.data.isProvisionalLayout ? <MaternalReportProvisionalNotice /> : null}
      {renderTable(t('indicators.kiaBlock'), report.data.indicators)}
      {renderTable(t('indicators.labBlock'), report.data.antenatalLab)}
    </div>
  );
}
