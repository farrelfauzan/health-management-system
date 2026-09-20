'use client';

import type { TrimesterScheduleEntry } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TrimesterScheduleRow } from '#components/client/maternal-care/trimester-schedule-row';

type TrimesterScheduleCardProps = {
  schedule: TrimesterScheduleEntry[];
};

/**
 * What Permenkes 21/2021 asks of each trimester and what this pregnancy has:
 * one visit in the first, two in the second, three in the third, plus the two
 * doctor visits the regulation requires separately.
 */
export function TrimesterScheduleCard({ schedule }: TrimesterScheduleCardProps) {
  const t = useTranslations();

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('maternalCare.schedule.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {schedule.map((entry) => (
          <TrimesterScheduleRow key={entry.trimester} entry={entry} />
        ))}
      </CardContent>
    </Card>
  );
}
