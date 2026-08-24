'use client';

import type { RoomResponse } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoomsTableRow } from '#components/client/rooms/rooms-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 6;

type RoomsTableProps = {
  rooms: RoomResponse[];
  isPending: boolean;
  isError: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (room: RoomResponse) => void;
  onRetire: (room: RoomResponse) => void;
};

export function RoomsTable({
  rooms,
  isPending,
  isError,
  canUpdate,
  canDelete,
  onEdit,
  onRetire,
}: RoomsTableProps) {
  const t = useTranslations('operations');

  if (!isPending && rooms.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'door_front'}
        title={isError ? t('rooms.loadError') : t('rooms.emptyRooms')}
        description={
          isError ? t('rooms.loadErrorDescription') : t('rooms.emptyOccupancyDescription')
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
          <DataTableHeaderCell>{t('rooms.ward')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.roomClass')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('rooms.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          rooms.map((room) => (
            <RoomsTableRow
              key={room.id}
              room={room}
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
