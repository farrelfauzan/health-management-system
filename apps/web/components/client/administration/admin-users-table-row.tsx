'use client';

import type { AdminUser } from '@hms/shared-types';
import { Badge, TableCell, TableRow, useAbility } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';

type AdminUsersTableRowProps = {
  user: AdminUser;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onOffboard: (user: AdminUser) => void;
};

export function AdminUsersTableRow({
  user,
  onEdit,
  onToggleActive,
  onOffboard,
}: AdminUsersTableRowProps) {
  const t = useTranslations('operations');
  const format = useFormatter();
  const ability = useAbility();
  const isOffboarded = user.offboardedAt !== undefined;
  const updateActions: RowAction[] = ability.can('update', 'User')
    ? [
        { label: t('administration.edit'), icon: 'edit', onSelect: () => onEdit(user) },
        user.isActive
          ? {
              label: t('administration.deactivate'),
              icon: 'block',
              isDestructive: true,
              onSelect: () => onToggleActive(user),
            }
          : {
              label: t('administration.activate'),
              icon: 'check_circle',
              onSelect: () => onToggleActive(user),
            },
      ]
    : [];
  // P16-T41. A separate action from deactivate, gated by a separate key that
  // only a super admin holds: offboarding opens a month of vault-only access
  // where deactivation ends access now. Offered only for an active account —
  // the API refuses the other case, and a menu item that always fails is a
  // trap. Re-onboard is the same key in reverse.
  const offboardActions: RowAction[] = ability.can('offboard', 'User')
    ? isOffboarded
      ? [
          {
            label: t('administration.offboarding.reonboard'),
            icon: 'undo',
            onSelect: () => onOffboard(user),
          },
        ]
      : user.isActive
        ? [
            {
              label: t('administration.offboarding.offboard'),
              icon: 'logout',
              isDestructive: true,
              onSelect: () => onOffboard(user),
            },
          ]
        : []
    : [];
  const actions: RowAction[] = [...updateActions, ...offboardActions];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={user.email} />
          <div>
            <p className="text-sm font-medium text-slate-900">{user.email}</p>
            <p className="text-xs text-slate-500">
              {t('administration.joined', {
                date: format.dateTime(new Date(user.createdAt), { dateStyle: 'medium' }),
              })}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4">
        <div className="flex flex-wrap gap-1.5">
          {user.roles.length === 0 ? (
            <span className="text-sm text-slate-500">{t('administration.noRoles')}</span>
          ) : (
            user.roles.map((role) => (
              <Badge
                key={role.code}
                variant="secondary"
                className="font-heading text-[11px] font-medium tracking-wide"
              >
                {role.name}
              </Badge>
            ))
          )}
        </div>
      </TableCell>
      <TableCell className="px-4">
        {isOffboarded ? (
          <StatusBadge status="offboarding" label={t('administration.offboarding.badge')} />
        ) : (
          <StatusBadge
            status={user.isActive ? 'active' : 'inactive'}
            label={user.isActive ? t('common.active') : t('common.inactive')}
          />
        )}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {format.dateTime(new Date(user.updatedAt), { dateStyle: 'medium' })}
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={t('common.actionsFor', { name: user.email })}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}
