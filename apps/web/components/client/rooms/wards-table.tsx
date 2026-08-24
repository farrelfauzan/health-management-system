'use client';

import type { WardResponse } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { WardsTableRow } from '#components/client/rooms/wards-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 5;

type WardsTableProps = {
  wards: WardResponse[];
  isPending: boolean;
  isError: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (ward: WardResponse) => void;
  onRetire: (ward: WardResponse) => void;
};

export function WardsTable({
  wards,
  isPending,
  isError,
  canUpdate,
  canDelete,
  onEdit,
  onRetire,
}: WardsTableProps) {
  const t = useTranslations('operations');

  if (!isPending && wards.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'meeting_room'}
        title={isError ? t('rooms.loadError') : t('rooms.emptyWards')}
        description={isError ? t('rooms.loadErrorDescription') : t('rooms.emptyOccupancyDescription')}
      />
    );
  }

  return (
    <DataTable minWidthClassName="min-w-[44rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('rooms.code')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.description')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          wards.map((ward) => (
            <WardsTableRow
              key={ward.id}
              ward={ward}
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
