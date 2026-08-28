'use client';

import type { OrganizationUnitMemberResponse } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { StatusBadge } from '#components/shared/status-badge';

type OrganizationUnitMemberRowProps = {
  member: OrganizationUnitMemberResponse;
  canManage: boolean;
  onRemove: (member: OrganizationUnitMemberResponse) => void;
};

export function OrganizationUnitMemberRow({
  member,
  canManage,
  onRemove,
}: OrganizationUnitMemberRowProps) {
  const t = useTranslations('operations.organization');
  const common = useTranslations('operations.common');
  const actions = canManage
    ? [
        {
          label: t('removeMember'),
          icon: 'person_remove',
          isDestructive: true,
          onSelect: () => onRemove(member),
        },
      ]
    : [];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3 text-sm text-slate-800">{member.email}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {member.roles.length > 0 ? member.roles.join(', ') : '—'}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={member.isActive ? 'ACTIVE' : 'INACTIVE'} />
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={common('actionsFor', { name: member.email })}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
