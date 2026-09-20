'use client';

import type { AntenatalVisitResponse } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';


type AntenatalVisitRowProps = {
  visit: AntenatalVisitResponse;
};

/**
 * One visit. A visit past the sixth has no SATUSEHAT code — the published list
 * stops at K6 — so it shows its ordinal instead of an invented name.
 */
export function AntenatalVisitRow({ visit }: AntenatalVisitRowProps) {
  const t = useTranslations();
  const format = useFormatter();

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-14 rounded-full bg-slate-100 px-2 py-0.5 text-center text-xs font-semibold text-slate-700">
        {visit.visitCode ?? `#${visit.ordinal}`}
      </span>
      <span className="flex-1 text-sm text-slate-900">
        {format.dateTime(new Date(visit.startedAt), { dateStyle: 'medium' })}
      </span>
      <span className="text-sm text-slate-600">
        {t('maternalCare.gestationalAgeValue', {
          weeks: visit.gestationalAge.weeks,
          days: visit.gestationalAge.days,
        })}
      </span>
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {visit.encounterStatus}
      </span>
    </li>
  );
}
