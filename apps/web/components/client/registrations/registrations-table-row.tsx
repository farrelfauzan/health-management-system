'use client';

import { REGISTRATION_STATUS_TRANSITIONS, type RegistrationListItem } from '@hms/shared-types';
import { Icon, TableCell, TableRow, useAbility } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { BpjsRegistrationStatus } from '#components/client/registrations/bpjs-registration-status';
import { RegistrationSessionHours } from '#components/client/registrations/registration-session-hours';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import {
  REGISTRATION_TRANSITION_META,
  type RegistrationTransitionTarget,
} from '#lib/registrations/registration-transition-meta';
import type { RegistrationsViewVariant } from '#lib/registrations/registrations-view-variant';

type RegistrationsTableRowProps = {
  registration: RegistrationListItem;
  variant: RegistrationsViewVariant;
  onTransition: (
    registration: RegistrationListItem,
    target: RegistrationTransitionTarget,
    isForced?: boolean,
  ) => void;
  onOpenEncounter: (registration: RegistrationListItem) => void;
};

export function RegistrationsTableRow({
  registration,
  variant,
  onTransition,
  onOpenEncounter,
}: RegistrationsTableRowProps) {
  const t = useTranslations('operations');
  const format = useFormatter();
  const ability = useAbility();
  const canUpdate = ability.can('update', 'Registration');
  const canOverrideCheckIn = ability.can('checkin-override', 'Registration');
  // P19-T16. The API refuses a check-in outside the doctor's practice window,
  // and the one case the row can already tell is the one worth greying out:
  // there are no hours today at all. Being merely early is left enabled — the
  // clock moves while the page sits open, and the refusal names the minute.
  const hasNoSessionToday =
    registration.appointment !== undefined && registration.todaySession === undefined;
  const allowedTargets = REGISTRATION_STATUS_TRANSITIONS[registration.status].filter(
    (target): target is RegistrationTransitionTarget =>
      target !== 'PENDING' && (variant === 'admin' || target === 'CANCELLED'),
  );
  // The clinical record starts here: a checked-in patient is one the doctor
  // can see, and this is the only path from the queue into an encounter.
  const canOpenEncounter =
    variant === 'admin' &&
    registration.status === 'CHECKED_IN' &&
    ability.can('write', 'Encounter');
  const transitionActions: RowAction[] = canUpdate
    ? allowedTargets.flatMap((target) => {
        const isBlockedCheckIn = target === 'CHECKED_IN' && hasNoSessionToday;
        const action: RowAction = {
          label:
            target === 'CHECKED_IN'
              ? t('registrations.checkIn')
              : target === 'COMPLETED'
                ? t('registrations.complete')
                : t('registrations.cancel'),
          icon: REGISTRATION_TRANSITION_META[target].icon,
          isDestructive: REGISTRATION_TRANSITION_META[target].isDestructive,
          isDisabled: isBlockedCheckIn,
          disabledReason: isBlockedCheckIn
            ? t('registrations.session.noSession', {
                doctor: registration.appointment?.doctor.fullName ?? '',
              })
            : undefined,
          onSelect: () => onTransition(registration, target),
        };
        // An administrator can still send the patient through; the API records
        // who did it and which hours were bypassed.
        return isBlockedCheckIn && canOverrideCheckIn
          ? [
              action,
              {
                label: t('registrations.session.checkInAnyway'),
                icon: 'lock_open',
                isDestructive: false,
                onSelect: () => onTransition(registration, target, true),
              },
            ]
          : [action];
      })
    : [];
  const actions: RowAction[] = canOpenEncounter
    ? [
        {
          label: t('registrations.openEncounter'),
          icon: 'clinical_notes',
          isDestructive: false,
          onSelect: () => onOpenEncounter(registration),
        },
        ...transitionActions,
      ]
    : transitionActions;

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
        {format.dateTime(new Date(registration.registeredAt), {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </TableCell>
      <TableCell className="px-4">
        {registration.appointment ? (
          <span className="flex items-center gap-1.5 text-sm text-slate-700">
            <Icon name="event" size={16} className="text-primary" />
            {format.dateTime(new Date(registration.appointment.scheduledAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        ) : (
          <span className="text-sm text-slate-400">{t('registrations.walkIn')}</span>
        )}
      </TableCell>
      <TableCell className="px-4">
        {registration.appointment ? (
          <div>
            <p className="text-sm text-slate-700">{registration.appointment.doctor.fullName}</p>
            <p className="text-xs text-slate-400">{registration.appointment.doctor.specialty}</p>
            <RegistrationSessionHours todaySession={registration.todaySession} />
          </div>
        ) : (
          <span className="text-sm text-slate-400">{t('common.unassigned')}</span>
        )}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge
          status={registration.status}
          label={t(`common.statuses.${registration.status}`)}
        />
      </TableCell>
      <TableCell className="px-4">
        <BpjsRegistrationStatus
          patientId={registration.patientId}
          patientName={registration.patient.fullName}
          registrationId={registration.id}
        />
      </TableCell>
      <TableCell className="px-4 text-right">
        {actions.length > 0 ? (
          <RowActionsMenu
            actions={actions}
            triggerLabel={t('common.actionsFor', { name: registration.patient.fullName })}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
