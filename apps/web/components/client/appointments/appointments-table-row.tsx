'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { canTransitionAppointmentStatus } from '@hms/shared-types';
import { TableCell, TableRow, useAbility } from '@hms/ui';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from '#lib/appointments/format-appointment-time';

const RESCHEDULABLE_STATUSES: AppointmentListItem['status'][] = ['SCHEDULED', 'CONFIRMED'];

type AppointmentsTableRowProps = {
  appointment: AppointmentListItem;
  onView: (appointment: AppointmentListItem) => void;
  onReschedule: (appointment: AppointmentListItem) => void;
  onCancel: (appointment: AppointmentListItem) => void;
};

export function AppointmentsTableRow({
  appointment,
  onView,
  onReschedule,
  onCancel,
}: AppointmentsTableRowProps) {
  const ability = useAbility();
  const canReschedule =
    ability.can('update', 'Appointment') && RESCHEDULABLE_STATUSES.includes(appointment.status);
  const canCancel =
    ability.can('cancel', 'Appointment') &&
    canTransitionAppointmentStatus(appointment.status, 'CANCELLED');
  const actions: RowAction[] = [
    { label: 'View', icon: 'visibility', onSelect: () => onView(appointment) },
    ...(canReschedule
      ? [
          {
            label: 'Reschedule',
            icon: 'edit_calendar',
            onSelect: () => onReschedule(appointment),
          },
        ]
      : []),
    ...(canCancel
      ? [
          {
            label: 'Cancel',
            icon: 'event_busy',
            isDestructive: true,
            onSelect: () => onCancel(appointment),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <p className="font-mono text-sm text-slate-900">
          {formatAppointmentTime(appointment.scheduledAt)}
        </p>
        <p className="font-mono text-xs text-slate-500">
          {formatAppointmentDate(appointment.scheduledAt)}
        </p>
      </TableCell>
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={appointment.patient.fullName} />
          <div>
            <p className="text-sm font-medium text-slate-900">{appointment.patient.fullName}</p>
            <p className="font-mono text-xs text-slate-500">{appointment.patient.mrn}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4">
        <p className="text-sm text-slate-900">{appointment.doctor.fullName}</p>
        <p className="text-xs text-slate-500">{appointment.doctor.specialty}</p>
      </TableCell>
      <TableCell className="max-w-56 truncate px-4 text-sm text-slate-600">
        {appointment.reason ?? '—'}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={appointment.status} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <RowActionsMenu
          actions={actions}
          triggerLabel={`Actions for ${appointment.patient.fullName}`}
        />
      </TableCell>
    </TableRow>
  );
}
