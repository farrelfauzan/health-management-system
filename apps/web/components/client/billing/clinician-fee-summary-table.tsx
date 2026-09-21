'use client';

import type { ClinicianFeePeriodSummaryView } from '@hms/shared-types';
import { TableBody, TableCell, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicianFeeSummaryTableRow } from '#components/client/billing/clinician-fee-summary-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { formatRupiah } from '#lib/billing/format-rupiah';

const TABLE_COLUMN_COUNT = 6;

type ClinicianFeeSummaryTableProps = {
  summary: ClinicianFeePeriodSummaryView | undefined;
  isPending: boolean;
  isError: boolean;
  onView: (doctorId: string) => void;
};

export function ClinicianFeeSummaryTable({
  summary,
  isPending,
  isError,
  onView,
}: ClinicianFeeSummaryTableProps) {
  const t = useTranslations('operations.billing.fees.statements');
  const clinicians = summary?.clinicians ?? [];

  if (!isPending && clinicians.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'receipt_long'}
        title={isError ? t('loadError') : t('empty')}
        description={isError ? undefined : t('emptyDescription')}
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('clinician')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('entries')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('lineAmount')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('grossFee')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('clinicShare')}</DataTableHeaderCell>
          <DataTableHeaderCell />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          clinicians.map((clinician) => (
            <ClinicianFeeSummaryTableRow
              key={clinician.doctorId}
              clinician={clinician}
              onView={onView}
            />
          ))
        )}
        {summary && clinicians.length > 0 ? (
          <TableRow className="bg-slate-50 font-semibold">
            <TableCell className="px-4 py-3 text-sm text-slate-900">{t('total')}</TableCell>
            <TableCell className="px-4 text-right text-sm">{summary.totals.entryCount}</TableCell>
            <TableCell className="px-4 text-right text-sm">
              {formatRupiah(summary.totals.lineAmount)}
            </TableCell>
            <TableCell className="px-4 text-right text-sm">
              {formatRupiah(summary.totals.grossFee)}
            </TableCell>
            <TableCell className="px-4 text-right text-sm">
              {formatRupiah(summary.totals.clinicShare)}
            </TableCell>
            <TableCell />
          </TableRow>
        ) : null}
      </TableBody>
    </DataTable>
  );
}
