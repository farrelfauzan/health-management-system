'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';
import { AppointmentSubjectMrn } from '#components/client/appointments/appointment-subject-mrn';

type UpcomingAppointmentsRowProps = {
  appointment: AppointmentListItem;
};

export function UpcomingAppointmentsRow({ appointment }: UpcomingAppointmentsRowProps) {
  const router = useRouter();
  const format = useFormatter();
  const t = useTranslations('dashboard.appointments');
  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <span className="flex items-center gap-3">
          <AvatarInitials name={appointment.subject.fullName} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-slate-900">
              {appointment.subject.fullName}
            </span>
            <AppointmentSubjectMrn subject={appointment.subject} />
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
        {format.dateTime(new Date(appointment.scheduledAt), { hour: '2-digit', minute: '2-digit' })}
      </TableCell>
      <TableCell className="px-4 py-3">
        <StatusBadge status={appointment.status} />
      </TableCell>
      <TableCell className="px-4 py-3 text-right">
        <RowActionsMenu
          actions={[
            {
              label: t('openInSchedule'),
              icon: 'event',
              onSelect: () => router.push('/admin/appointments'),
            },
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
