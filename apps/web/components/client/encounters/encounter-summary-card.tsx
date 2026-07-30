'use client';

import type { EncounterDetail } from '@hms/shared-types';
import { Card, CardContent, Icon } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';
import { formatEncounterDuration } from '#lib/encounters/format-encounter-duration';

type EncounterSummaryCardProps = {
  encounter: EncounterDetail;
  /** Absent when the viewer has no patient directory to link into. */
  patientHref?: string;
};

export function EncounterSummaryCard({ encounter, patientHref }: EncounterSummaryCardProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <AvatarInitials name={encounter.patient.fullName} />
          <div>
            {patientHref ? (
              <Link
                href={patientHref}
                className="font-heading text-sm font-semibold text-slate-900 hover:underline"
              >
                {encounter.patient.fullName}
              </Link>
            ) : (
              <p className="font-heading text-sm font-semibold text-slate-900">
                {encounter.patient.fullName}
              </p>
            )}
            <p className="font-mono text-xs text-slate-500">{encounter.patient.mrn}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <p className="flex items-center gap-1.5 text-slate-600">
            <Icon name="stethoscope" size={16} className="text-slate-400" />
            {encounter.doctor.fullName}
          </p>
          <p className="flex items-center gap-1.5 text-slate-600">
            <Icon name="schedule" size={16} className="text-slate-400" />
            {format.dateTime(new Date(encounter.startedAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
          <p className="flex items-center gap-1.5 text-slate-600">
            <Icon name="timer" size={16} className="text-slate-400" />
            {formatEncounterDuration(encounter.startedAt, encounter.endedAt, {
              minutes: (minutes) =>
                t('common.durationMinutes', { minutes: format.number(minutes) }),
              hoursMinutes: (hours, minutes) =>
                t('common.durationHoursMinutes', {
                  hours: format.number(hours),
                  minutes: format.number(minutes, { minimumIntegerDigits: 2 }),
                }),
            })}
          </p>
          <StatusBadge
            status={encounter.status}
            label={t(`encounters.status.${encounter.status}`)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
