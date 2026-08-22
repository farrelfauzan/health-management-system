'use client';

import type { RoomClassResponse } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoomClassesTableRow } from '#components/client/rooms/room-classes-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 6;

type RoomClassesTableProps = {
  roomClasses: RoomClassResponse[];
  isPending: boolean;
  isError: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (roomClass: RoomClassResponse) => void;
  onRetire: (roomClass: RoomClassResponse) => void;
};

export function RoomClassesTable({
  roomClasses,
  isPending,
  isError,
  canUpdate,
  canDelete,
  onEdit,
  onRetire,
}: RoomClassesTableProps) {
  const t = useTranslations('operations');

  if (!isPending && roomClasses.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'category'}
        title={isError ? t('rooms.loadError') : t('rooms.emptyRoomClasses')}
        description={
          isError ? t('rooms.loadErrorDescription') : t('rooms.emptyRoomClassesDescription')
        }
      />
    );
  }

  return (
    <DataTable minWidthClassName="min-w-[48rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('rooms.code')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.description')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.quota')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          roomClasses.map((roomClass) => (
            <RoomClassesTableRow
              key={roomClass.id}
              roomClass={roomClass}
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
