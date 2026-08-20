'use client';

import type { RoleListItem } from '@hms/shared-types';
import { Badge, TableCell, TableRow, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';

type RolesTableRowProps = {
  role: RoleListItem;
  onEdit: (role: RoleListItem) => void;
  onEditPermissions: (role: RoleListItem) => void;
  onDelete: (role: RoleListItem) => void;
};

export function RolesTableRow({ role, onEdit, onEditPermissions, onDelete }: RolesTableRowProps) {
  const t = useTranslations('operations.administration.roles');
  const ability = useAbility();
  // System roles are owned by the seed and the API refuses to mutate them
  // (IMP-2); offering the actions would only manufacture 403s.
  const actions: RowAction[] = role.isSystem
    ? []
    : [
        ...(ability.can('update', 'Role')
          ? [
              { label: t('edit'), icon: 'edit', onSelect: () => onEdit(role) },
              {
                label: t('editPermissions'),
                icon: 'checklist',
                onSelect: () => onEditPermissions(role),
              },
            ]
          : []),
        ...(ability.can('delete', 'Role')
          ? [
              {
                label: t('delete'),
                icon: 'delete',
                isDestructive: true,
                onSelect: () => onDelete(role),
              },
            ]
          : []),
      ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{role.name}</p>
        <p className="font-mono text-xs text-slate-500">{role.code}</p>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{role.description ?? '—'}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {t('memberCount', { count: role.memberCount })}
      </TableCell>
      <TableCell className="px-4">
        {role.isSystem ? (
          <Badge variant="secondary" className="font-heading text-[11px] font-medium tracking-wide">
            {t('systemBadge')}
          </Badge>
        ) : (
          <Badge variant="outline" className="font-heading text-[11px] font-medium tracking-wide">
            {t('customBadge')}
          </Badge>
        )}
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu actions={actions} triggerLabel={t('actionsFor', { name: role.name })} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}
