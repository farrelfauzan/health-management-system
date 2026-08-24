'use client';

import type { RoomClassResponse } from '@hms/shared-types';
import { TableCell, TableRow, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';

type RoomClassesTableRowProps = {
  roomClass: RoomClassResponse;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (roomClass: RoomClassResponse) => void;
  onRetire: (roomClass: RoomClassResponse) => void;
};

export function RoomClassesTableRow({
  roomClass,
  canUpdate,
  canDelete,
  onEdit,
  onRetire,
}: RoomClassesTableRowProps) {
  const t = useTranslations('operations');
  // A class that rooms still carry cannot be retired — the API answers 409,
  // and greying the item says so before the click.
  const isInUse = roomClass.allocatedBeds > 0;
  const isAtQuota = roomClass.quota !== undefined && roomClass.allocatedBeds >= roomClass.quota;
  const actions = [
    ...(canUpdate
      ? [{ label: t('common.edit'), icon: 'edit', onSelect: () => onEdit(roomClass) }]
      : []),
    ...(canDelete
      ? [
          {
            label: t('rooms.retire'),
            icon: 'archive',
            isDestructive: true,
            isDisabled: isInUse,
            onSelect: () => onRetire(roomClass),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <DataTableMonoCell>{roomClass.code}</DataTableMonoCell>
      <TableCell className="px-4 py-3 text-sm text-slate-800">{roomClass.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {roomClass.description ?? '—'}
      </TableCell>
      <TableCell className={cn('px-4 text-sm', isAtQuota ? 'text-warning' : 'text-slate-600')}>
        {roomClass.quota === undefined
          ? t('rooms.uncapped')
          : t('rooms.quotaUsage', { allocated: roomClass.allocatedBeds, quota: roomClass.quota })}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={roomClass.isActive ? 'ACTIVE' : 'INACTIVE'} />
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={t('common.actionsFor', { name: roomClass.name })}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
