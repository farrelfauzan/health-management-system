'use client';

import type { TaxReportKindValue, TaxReportListItem } from '@hms/shared-types';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxReportMonthsTableRow } from '#components/client/taxes/tax-report-months-table-row';

type TaxReportMonthsTableProps = {
  kind: TaxReportKindValue;
  periods: string[];
  reports: TaxReportListItem[];
  currentPeriod: string;
  canWrite: boolean;
};

/** A year of one report kind as a table: one row per month, January first. */
export function TaxReportMonthsTable({
  kind,
  periods,
  reports,
  currentPeriod,
  canWrite,
}: TaxReportMonthsTableProps) {
  const t = useTranslations('operations.taxes.reports');

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.period')}</TableHead>
            <TableHead className="text-right">{t('columns.taxDue')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            <TableHead className="text-right">{t('columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.map((period) => (
            <TaxReportMonthsTableRow
              key={period}
              period={period}
              kind={kind}
              report={reports.find((item) => item.period === period && item.kind === kind)}
              canWrite={canWrite}
              isFuture={period > currentPeriod}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
