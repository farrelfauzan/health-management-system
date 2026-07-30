'use client';

import type { EncounterListItem } from '@hms/shared-types';
import { Icon, TableCell, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';
import { formatEncounterDuration } from '#lib/encounters/format-encounter-duration';

type EncountersTableRowProps = {
  encounter: EncounterListItem;
  basePath: string;
};

export function EncountersTableRow({ encounter, basePath }: EncountersTableRowProps) {
  const hasPrimaryRecord = encounter.diagnosisCount > 0;
  const t = useTranslations('clinical');
  const format = useFormatter();

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={encounter.patient.fullName} />
          <p className="text-sm font-medium text-slate-900">{encounter.patient.fullName}</p>
        </div>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {format.dateTime(new Date(encounter.startedAt), {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatEncounterDuration(encounter.startedAt, encounter.endedAt, {
          minutes: (minutes) => t('common.durationMinutes', { minutes: format.number(minutes) }),
          hoursMinutes: (hours, minutes) =>
            t('common.durationHoursMinutes', {
              hours: format.number(hours),
              minutes: format.number(minutes, { minimumIntegerDigits: 2 }),
            }),
        })}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-700">{encounter.doctor.fullName}</TableCell>
      <TableCell className="px-4">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1" title={t('encounters.vitalsCount')}>
            <Icon name="monitor_heart" size={15} className="text-slate-400" />
            {encounter.vitalSignsCount}
          </span>
          <span
            className={
              hasPrimaryRecord ? 'flex items-center gap-1' : 'flex items-center gap-1 text-warning'
            }
            title={t('encounters.diagnosesCount')}
          >
            <Icon name="clinical_notes" size={15} />
            {encounter.diagnosisCount}
          </span>
          <span className="flex items-center gap-1" title={t('encounters.proceduresCount')}>
            <Icon name="medical_services" size={15} className="text-slate-400" />
            {encounter.procedureCount}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={encounter.status} label={t(`encounters.status.${encounter.status}`)} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <Link
          href={`${basePath}/${encounter.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('common.open')}
          <Icon name="chevron_right" size={16} />
        </Link>
      </TableCell>
    </TableRow>
  );
}
