'use client';

import type { ShkScreeningView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ShkWorklistRow } from '#components/client/maternal-care/shk-worklist-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import type { ShkRowAction } from '#lib/maternal-care/shk-row-action';

const TABLE_COLUMN_COUNT = 6;

type ShkWorklistTableProps = {
  items: ShkScreeningView[];
  isPending: boolean;
  isError: boolean;
  patientDetailBasePath: string;
  canWrite: boolean;
  onAction: (action: ShkRowAction, screening: ShkScreeningView) => void;
};

/** The SHK samples of one tab, soonest deadline first as the API sorts them. */
export function ShkWorklistTable({
  items,
  isPending,
  isError,
  patientDetailBasePath,
  canWrite,
  onAction,
}: ShkWorklistTableProps) {
  const t = useTranslations('maternalCare.shk');

  if (isPending) {
    return (
      <DataTable minWidthClassName="min-w-[56rem]">
        <TableBody>
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        </TableBody>
      </DataTable>
    );
  }

  if (isError && items.length === 0) {
    return <EmptyState icon="error" title={t('loadError')} />;
  }

  if (items.length === 0) {
    return <EmptyState icon="child_care" title={t('empty')} />;
  }

  return (
    <DataTable minWidthClassName="min-w-[56rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.baby')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.window')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.status')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.laboratory')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.attendant')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('columns.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((screening) => (
          <ShkWorklistRow
            key={screening.id}
            screening={screening}
            patientDetailBasePath={patientDetailBasePath}
            canWrite={canWrite}
            onAction={onAction}
          />
        ))}
      </TableBody>
    </DataTable>
  );
}
