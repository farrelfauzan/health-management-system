'use client';

import type { DoctorPatientActivityEvent } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, useAbility } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import type { TimelineEntry } from '#components/shared/timeline-item';
import { TimelineList } from '#components/shared/timeline-list';
import { usePatientActivity } from '#lib/patients/use-patient-activity';

function toTimelineEntry(
  event: DoctorPatientActivityEvent,
  formatDate: (date: Date) => string,
  assignedLabel: string,
  unassignedLabel: string,
  formatAssignment: (id: string) => string,
): TimelineEntry {
  const occurredAt = new Date(event.occurredAt);
  return {
    id: event.id,
    time: Number.isNaN(occurredAt.getTime()) ? '-' : formatDate(occurredAt),
    title: event.action === 'ASSIGNED' ? assignedLabel : unassignedLabel,
    description: formatAssignment(`${event.assignmentId.slice(0, 8)}…`),
  };
}

type PatientActivityCardProps = {
  patientId: string;
};

export function PatientActivityCard({ patientId }: PatientActivityCardProps) {
  const ability = useAbility();
  const t = useTranslations('clinical');
  const format = useFormatter();
  const canReadActivity = ability.can('read', 'DoctorPatientActivity');
  const activityQuery = usePatientActivity(patientId, canReadActivity);

  if (!canReadActivity) {
    return null;
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('patients.activity')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activityQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : activityQuery.entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            {activityQuery.isError ? t('patients.activityError') : t('patients.activityEmpty')}
          </p>
        ) : (
          <TimelineList
            entries={activityQuery.entries.map((entry) =>
              toTimelineEntry(
                entry,
                (date) => format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' }),
                t('patients.doctorAssigned'),
                t('patients.doctorUnassigned'),
                (id) => t('patients.assignment', { id }),
              ),
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}
