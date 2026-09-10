'use client';

import { formatPhoneNumber, type ProspectivePatientView } from '@hms/shared-types';
import { Badge, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { ProspectivePatientRowActions } from '#components/client/prospective-patients/prospective-patient-row-actions';
import { StatusBadge } from '#components/shared/status-badge';

type ProspectivePatientsTableRowProps = {
  item: ProspectivePatientView;
  onResult: (message: string) => void;
  onFailed: (message: string) => void;
};

/** One person who booked through chat and is not a patient yet (`P19-T08`). */
export function ProspectivePatientsTableRow({
  item,
  onResult,
  onFailed,
}: ProspectivePatientsTableRowProps) {
  const t = useTranslations('prospectivePatients');
  const format = useFormatter();
  const upcoming = item.upcomingAppointment;

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{item.fullName}</p>
        <p className="text-xs text-slate-500">
          {item.patientMrn ?? t('openBookings', { count: item.openAppointments })}
        </p>
      </TableCell>
      <TableCell className="px-4 font-mono text-sm text-slate-700">
        {formatPhoneNumber(item.phoneNumber)}
      </TableCell>
      <TableCell className="px-4">
        <Badge variant="outline">{t(`channel.${item.channel}`)}</Badge>
      </TableCell>
      <TableCell className="px-4">
        {upcoming === null ? (
          <span className="text-sm text-slate-400">{t('noAppointment')}</span>
        ) : (
          <>
            <p className="text-sm text-slate-900">
              {format.dateTime(new Date(upcoming.scheduledAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <p className="text-xs text-slate-500">{upcoming.doctorName}</p>
          </>
        )}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={item.status} label={t(`status.${item.status}`)} />
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-700">
        {format.relativeTime(new Date(item.expiresAt))}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-700">
        {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
      </TableCell>
      <TableCell className="px-4">
        <ProspectivePatientRowActions item={item} onResult={onResult} onFailed={onFailed} />
      </TableCell>
    </TableRow>
  );
}
