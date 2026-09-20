'use client';

import type { ActivePregnancyEpisodeResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';


type PregnancyEpisodeHeaderCardProps = {
  episode: ActivePregnancyEpisodeResponse;
};

/**
 * The header a midwife reads first: HPHT, HPL, GPA and how far along she is
 * today. Four facts, because everything else on the tab is counted from them.
 */
export function PregnancyEpisodeHeaderCard({ episode }: PregnancyEpisodeHeaderCardProps) {
  const t = useTranslations();
  const notRecorded = t('maternalCare.header.notRecorded');
  const rows: Array<{ label: string; value: string }> = [
    {
      label: t('maternalCare.header.lastMenstrualPeriodDate'),
      value: episode.episode.lastMenstrualPeriodDate ?? notRecorded,
    },
    {
      label: t('maternalCare.header.estimatedDeliveryDate'),
      value: episode.episode.estimatedDeliveryDate,
    },
    { label: t('maternalCare.header.gpa'), value: episode.episode.gpaLabel },
    {
      label: t('maternalCare.header.gestationalAge'),
      value: t('maternalCare.gestationalAgeValue', {
        weeks: episode.gestationalAge.weeks,
        days: episode.gestationalAge.days,
      }),
    },
    {
      label: t('maternalCare.header.eddSource'),
      value: t(`maternalCare.eddSources.${episode.episode.eddSource}`),
    },
    {
      label: t('maternalCare.header.bloodType'),
      value:
        episode.episode.bloodType === null
          ? notRecorded
          : `${episode.episode.bloodType}${episode.episode.rhesus ?? ''}`,
    },
  ];

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('maternalCare.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{row.label}</p>
            <p className="text-sm font-medium text-slate-900">{row.value}</p>
          </div>
        ))}
        {episode.episode.riskNotes ? (
          <div className="sm:col-span-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {t('maternalCare.header.riskNotes')}
            </p>
            <p className="text-sm text-slate-900">{episode.episode.riskNotes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
