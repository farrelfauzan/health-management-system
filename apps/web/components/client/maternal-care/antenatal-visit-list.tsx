'use client';

import type { AntenatalVisitResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AntenatalVisitRow } from '#components/client/maternal-care/antenatal-visit-row';

type AntenatalVisitListProps = {
  visits: AntenatalVisitResponse[];
};

/** The episode's visits in K-order, which is the order they happened in. */
export function AntenatalVisitList({ visits }: AntenatalVisitListProps) {
  const t = useTranslations();

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">{t('maternalCare.visits.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {visits.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {visits.map((visit) => (
              <AntenatalVisitRow key={visit.id} visit={visit} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('maternalCare.visits.empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
