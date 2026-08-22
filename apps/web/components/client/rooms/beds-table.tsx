'use client';

import type { BedResponse } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BedsTableRow } from '#components/client/rooms/beds-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

type BedsTableProps = {
  beds: BedResponse[];
  isPending: boolean;
  isError: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (bed: BedResponse) => void;
  onRetire: (bed: BedResponse) => void;
};

export function BedsTable({
  beds,
  isPending,
  isError,
  canUpdate,
  canDelete,
  onEdit,
  onRetire,
}: BedsTableProps) {
  const t = useTranslations('operations');

  if (!isPending && beds.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'king_bed'}
        title={isError ? t('rooms.loadError') : t('rooms.emptyBeds')}
        description={
          isError ? t('rooms.loadErrorDescription') : t('rooms.emptyOccupancyDescription')
        }
      />
    );
  }

  return (
    <DataTable minWidthClassName="min-w-[52rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('rooms.code')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.room')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.ward')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.roomClass')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.status')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.notes')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          beds.map((bed) => (
            <BedsTableRow
              key={bed.id}
              bed={bed}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onEdit={onEdit}
              onRetire={onRetire}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
