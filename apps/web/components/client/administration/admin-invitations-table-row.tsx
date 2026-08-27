'use client';

import type { UserInvitationView } from '@hms/shared-types';
import { Badge, TableCell, TableRow, useAbility } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';

type AdminInvitationsTableRowProps = {
  invitation: UserInvitationView;
  onResend: (invitation: UserInvitationView) => void;
  onRevoke: (invitation: UserInvitationView) => void;
};

const STATUS_TONE: Record<UserInvitationView['status'], string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REVOKED: 'border-slate-200 bg-slate-50 text-slate-600',
  EXPIRED: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function AdminInvitationsTableRow({
  invitation,
  onResend,
  onRevoke,
}: AdminInvitationsTableRowProps) {
  const t = useTranslations('operations.administration.invitations');
  const format = useFormatter();
  const ability = useAbility();
  // Accepted invitations offer nothing: the account exists, and both actions
  // would either fail or mislead. Everything else can be resent or withdrawn,
  // including an expired one — resending is exactly the recovery for it.
  const canAct = ability.can('update', 'User') && invitation.status !== 'ACCEPTED';
  const actions: RowAction[] = canAct
    ? [
        { label: t('resend'), icon: 'outgoing_mail', onSelect: () => onResend(invitation) },
        ...(invitation.status === 'REVOKED'
          ? []
          : [
              {
                label: t('revoke'),
                icon: 'link_off',
                isDestructive: true,
                onSelect: () => onRevoke(invitation),
              },
            ]),
      ]
    : [];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{invitation.email}</p>
        <p className="text-xs text-slate-500">
          {t('invitedBy', { email: invitation.invitedByEmail ?? t('unknownInviter') })}
        </p>
      </TableCell>
      <TableCell className="px-4">
        <div className="flex flex-wrap gap-1.5">
          {invitation.roles.map((role) => (
            <Badge
              key={role.code}
              variant="outline"
              className="border-slate-200 bg-slate-50 text-slate-700"
            >
              {role.name}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="px-4">
        <Badge variant="outline" className={STATUS_TONE[invitation.status]}>
          {t(`status.${invitation.status}`)}
        </Badge>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {format.dateTime(new Date(invitation.expiresAt), {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </TableCell>
      <TableCell className="px-4 text-right">
        <RowActionsMenu
          actions={actions}
          triggerLabel={t('actionsFor', { email: invitation.email })}
        />
      </TableCell>
    </TableRow>
  );
}
