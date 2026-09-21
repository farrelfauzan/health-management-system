'use client';

import type { PostnatalScheduleResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PostnatalScheduleChip } from '#components/client/maternal-care/postnatal-schedule-chip';

type PostnatalScheduleCardProps = {
  schedule: PostnatalScheduleResponse;
};

/**
 * The "Nifas & neonatus" timeline (P25-T12): the mother's four KF windows and
 * the baby's three KN windows, each with its dates and status.
 */
export function PostnatalScheduleCard({ schedule }: PostnatalScheduleCardProps) {
  const t = useTranslations('maternalCare.postnatal');
  const motherEntries = schedule.entries.filter((entry) => entry.subject === 'MOTHER');
  const newbornEntries = schedule.entries.filter((entry) => entry.subject === 'NEWBORN');

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500">{t('windowHint')}</p>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700">{t('motherHeading')}</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {motherEntries.map((entry) => (
              <PostnatalScheduleChip key={entry.code} entry={entry} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700">{t('newbornHeading')}</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {newbornEntries.map((entry) => (
              <PostnatalScheduleChip key={entry.code} entry={entry} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
