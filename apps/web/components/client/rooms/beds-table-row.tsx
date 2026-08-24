'use client';

import type { BedResponse } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';

type BedsTableRowProps = {
  bed: BedResponse;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (bed: BedResponse) => void;
  onRetire: (bed: BedResponse) => void;
};

export function BedsTableRow({ bed, canUpdate, canDelete, onEdit, onRetire }: BedsTableRowProps) {
  const t = useTranslations('operations');
  // A bed with a patient in it is not editable or retirable — the API refuses
  // both with a 409, and greying the menu out says so before the click.
  const isOccupied = bed.status === 'OCCUPIED';
  const actions = [
    ...(canUpdate
      ? [
          {
            label: t('common.edit'),
            icon: 'edit',
            isDisabled: isOccupied,
            onSelect: () => onEdit(bed),
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: t('rooms.retire'),
            icon: 'archive',
            isDestructive: true,
            isDisabled: isOccupied,
            onSelect: () => onRetire(bed),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <DataTableMonoCell>{bed.code}</DataTableMonoCell>
      <TableCell className="px-4 py-3 text-sm text-slate-800">{bed.room.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{bed.ward.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {bed.room.roomClass.name}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={bed.status} />
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{bed.notes ?? '—'}</TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={t('common.actionsFor', { name: `${bed.room.name} ${bed.code}` })}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
