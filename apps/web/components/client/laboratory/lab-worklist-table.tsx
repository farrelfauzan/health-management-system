'use client';

import type { LabWorklistBucketValue, LabWorklistItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabWorklistRow } from '#components/client/laboratory/lab-worklist-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

type LabWorklistTableProps = {
  items: LabWorklistItem[];
  bucket: LabWorklistBucketValue;
  isPending: boolean;
  isError: boolean;
  onCollect: (item: LabWorklistItem) => void;
};

/**
 * The list itself. Cito sorts first, then oldest first: the order that has
 * waited longest is the one the bench picks up next, and an urgent one jumps
 * that queue whatever its age.
 */
export function LabWorklistTable({
  items,
  bucket,
  isPending,
  isError,
  onCollect,
}: LabWorklistTableProps) {
  const t = useTranslations('operations.laboratory.worklist');
  const sorted = [...items].sort(compareWorklistItems);

  if (isPending) {
    return <TableSkeleton columns={TABLE_COLUMN_COUNT} />;
  }

  if (isError && sorted.length === 0) {
    return <EmptyState icon="error" title={t('error')} />;
  }

  if (sorted.length === 0) {
    return <EmptyState icon="biotech" title={t('empty')} />;
  }

  return (
    <DataTable minWidthClassName="min-w-[64rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.patient')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.order')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.tests')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.priority')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.waiting')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.specimens')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('columns.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((item) => (
          <LabWorklistRow
            key={item.id}
            item={item}
            isCollectable={bucket === 'to-collect'}
            onCollect={onCollect}
          />
        ))}
      </TableBody>
    </DataTable>
  );
}

function compareWorklistItems(left: LabWorklistItem, right: LabWorklistItem): number {
  const urgency = Number(right.priority === 'URGENT') - Number(left.priority === 'URGENT');
  if (urgency !== 0) {
    return urgency;
  }
  return new Date(left.orderedAt).getTime() - new Date(right.orderedAt).getTime();
}
