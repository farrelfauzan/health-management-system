'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useRouter } from 'next/navigation';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';

type UpcomingAppointmentsRowProps = {
  appointment: AppointmentListItem;
};

function formatAppointmentTime(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UpcomingAppointmentsRow({ appointment }: UpcomingAppointmentsRowProps) {
  const router = useRouter();
  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <span className="flex items-center gap-3">
          <AvatarInitials name={appointment.patient.fullName} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-slate-900">
              {appointment.patient.fullName}
            </span>
            <span className="font-mono text-xs text-slate-500">{appointment.patient.mrn}</span>
          </span>
        </span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-slate-900">{appointment.reason}</span>
          <span className="truncate text-xs text-slate-500">{appointment.doctor.fullName}</span>
        </span>
      </TableCell>
      <TableCell className="px-4 py-3 font-mono text-sm text-slate-600">
        {formatAppointmentTime(appointment.scheduledAt)}
      </TableCell>
      <TableCell className="px-4 py-3">
        <StatusBadge status={appointment.status} />
      </TableCell>
      <TableCell className="px-4 py-3 text-right">
        <RowActionsMenu
          actions={[
            {
              label: 'Open in schedule',
              icon: 'event',
              onSelect: () => router.push('/admin/appointments'),
            },
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
