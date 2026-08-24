'use client';

import type { WardResponse } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';

type WardsTableRowProps = {
  ward: WardResponse;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (ward: WardResponse) => void;
  onRetire: (ward: WardResponse) => void;
};

export function WardsTableRow({
  ward,
  canUpdate,
  canDelete,
  onEdit,
  onRetire,
}: WardsTableRowProps) {
  const t = useTranslations('operations');
  const actions = [
    ...(canUpdate ? [{ label: t('common.edit'), icon: 'edit', onSelect: () => onEdit(ward) }] : []),
    ...(canDelete
      ? [
          {
            label: t('rooms.retire'),
            icon: 'archive',
            isDestructive: true,
            onSelect: () => onRetire(ward),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <DataTableMonoCell>{ward.code}</DataTableMonoCell>
      <TableCell className="px-4 py-3 text-sm text-slate-800">{ward.name}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{ward.description ?? '—'}</TableCell>
      <TableCell className="px-4">
        <StatusBadge status={ward.isActive ? 'ACTIVE' : 'INACTIVE'} />
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu actions={actions} triggerLabel={t('common.actionsFor', { name: ward.name })} />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
