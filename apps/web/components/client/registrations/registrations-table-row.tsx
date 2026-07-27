'use client';

import {
  REGISTRATION_STATUS_TRANSITIONS,
  type RegistrationListItem,
} from '@hms/shared-types';
import { Icon, TableCell, TableRow, useAbility } from '@hms/ui';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { formatRegisteredAt } from '#lib/registrations/format-registered-at';
import {
  REGISTRATION_TRANSITION_META,
  type RegistrationTransitionTarget,
} from '#lib/registrations/registration-transition-meta';
import type { RegistrationsViewVariant } from '#lib/registrations/registrations-view-variant';

type RegistrationsTableRowProps = {
  registration: RegistrationListItem;
  variant: RegistrationsViewVariant;
  onTransition: (registration: RegistrationListItem, target: RegistrationTransitionTarget) => void;
};

export function RegistrationsTableRow({
  registration,
  variant,
  onTransition,
}: RegistrationsTableRowProps) {
  const ability = useAbility();
  const canUpdate = ability.can('update', 'Registration');
  const allowedTargets = REGISTRATION_STATUS_TRANSITIONS[registration.status].filter(
    (target): target is RegistrationTransitionTarget =>
      target !== 'PENDING' && (variant === 'admin' || target === 'CANCELLED'),
  );
  const actions: RowAction[] = canUpdate
    ? allowedTargets.map((target) => ({
        label: REGISTRATION_TRANSITION_META[target].actionLabel,
        icon: REGISTRATION_TRANSITION_META[target].icon,
        isDestructive: REGISTRATION_TRANSITION_META[target].isDestructive,
        onSelect: () => onTransition(registration, target),
      }))
    : [];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={registration.patient.fullName} />
          <p className="text-sm font-medium text-slate-900">{registration.patient.fullName}</p>
        </div>
      </TableCell>
      <DataTableMonoCell>{registration.patient.mrn}</DataTableMonoCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatRegisteredAt(registration.registeredAt)}
      </TableCell>
      <TableCell className="px-4">
        {registration.appointment ? (
          <span className="flex items-center gap-1.5 text-sm text-slate-700">
            <Icon name="event" size={16} className="text-primary" />
            {formatRegisteredAt(registration.appointment.scheduledAt)}
          </span>
        ) : (
          <span className="text-sm text-slate-400">Walk-in</span>
        )}
      </TableCell>
      <TableCell className="px-4">
        {registration.appointment ? (
          <div>
            <p className="text-sm text-slate-700">{registration.appointment.doctor.fullName}</p>
            <p className="text-xs text-slate-400">{registration.appointment.doctor.specialty}</p>
          </div>
        ) : (
          <span className="text-sm text-slate-400">Unassigned</span>
        )}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={registration.status} />
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={`Actions for ${registration.patient.fullName}`}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
