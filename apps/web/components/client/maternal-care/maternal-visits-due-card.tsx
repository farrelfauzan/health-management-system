'use client';

import { Card, CardContent, Skeleton } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { MaternalVisitDueRow } from '#components/client/maternal-care/maternal-visit-due-row';
import { useMaternalVisitsDue } from '#lib/maternal-care/use-maternal-visits-due';

type MaternalVisitsDueCardProps = {
  /** Where a patient's record opens, e.g. `/doctor/patients`. */
  patientBasePath: string;
};

/**
 * "Jatuh tempo minggu ini" on the clinician's dashboard (P25-T17): every
 * maternal visit due in the coming week, from all four schedules, with
 * whether a WhatsApp reminder may go and whether it did.
 */
export function MaternalVisitsDueCard({ patientBasePath }: MaternalVisitsDueCardProps) {
  const t = useTranslations('maternalCare.dueThisWeek');
  const format = useFormatter();
  const dueQuery = useMaternalVisitsDue(true);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-sm font-semibold text-slate-700">
          {t('title')}
          <span className="ml-2 text-xs font-normal text-slate-400">
            {format.number(dueQuery.items.length)}
          </span>
        </h2>
        <p className="text-xs text-slate-500">{t('subtitle')}</p>
      </div>
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          {dueQuery.isPending ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : dueQuery.items.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {dueQuery.items.map((item) => (
                <MaternalVisitDueRow
                  key={`${item.patientId}|${item.visitKey}`}
                  item={item}
                  patientBasePath={patientBasePath}
                />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              {dueQuery.isError ? t('loadError') : t('empty')}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
