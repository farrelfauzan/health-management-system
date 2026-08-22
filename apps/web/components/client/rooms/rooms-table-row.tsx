'use client';

import type { RoomResponse } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';

type RoomsTableRowProps = {
  room: RoomResponse;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (room: RoomResponse) => void;
  onRetire: (room: RoomResponse) => void;
};

export function RoomsTableRow({
  room,
  canUpdate,
  canDelete,
  onEdit,
  onRetire,
}: RoomsTableRowProps) {
  const t = useTranslations('operations');
  const actions = [
    ...(canUpdate ? [{ label: t('common.edit'), icon: 'edit', onSelect: () => onEdit(room) }] : []),
    ...(canDelete
      ? [
          {
            label: t('rooms.retire'),
            icon: 'archive',
            isDestructive: true,
            onSelect: () => onRetire(room),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <DataTableMonoCell>{room.code}</DataTableMonoCell>
      <TableCell className="px-4 py-3 text-sm text-slate-800">{room.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{room.ward.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {room.roomClass.name}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={room.isActive ? 'ACTIVE' : 'INACTIVE'} />
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={t('common.actionsFor', { name: room.name })}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
