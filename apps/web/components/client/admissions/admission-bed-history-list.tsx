'use client';

import type { BedAssignmentResponse } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { formatBedLocation } from '#lib/admissions/format-bed-location';

type AdmissionBedHistoryListProps = {
  assignments: BedAssignmentResponse[];
};

/**
 * Every bed the stay has held, oldest first — the same rows IMP-15 prices
 * night by night, so a disputed bill can be read straight off the screen.
 */
export function AdmissionBedHistoryList({ assignments }: AdmissionBedHistoryListProps) {
  const t = useTranslations('operations.admissions');
  const format = useFormatter();

  return (
    <ol className="space-y-2">
      {assignments.map((assignment) => (
        <li
          key={assignment.id}
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
        >
          <span className="text-sm text-slate-800">{formatBedLocation(assignment.bed)}</span>
          <span className="text-xs text-slate-500">
            {format.dateTime(new Date(assignment.startedAt), { dateStyle: 'medium', timeStyle: 'short' })}
            {' — '}
            {assignment.endedAt ? (
              format.dateTime(new Date(assignment.endedAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            ) : (
              <Badge className="ml-1 rounded-full border-transparent bg-info-tint text-info">
                {t('current')}
              </Badge>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
