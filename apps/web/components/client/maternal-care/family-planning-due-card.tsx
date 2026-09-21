'use client';

import { Card, CardContent, Skeleton } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { FamilyPlanningDueRow } from '#components/client/maternal-care/family-planning-due-row';
import { useFamilyPlanningDue } from '#lib/maternal-care/use-family-planning-due';

type FamilyPlanningDueCardProps = {
  /** Where a patient's record opens, e.g. `/doctor/patients`. */
  patientBasePath: string;
};

/**
 * The KB due list on the clinician's dashboard (P25-T14): injectables and
 * pills that lapse silently unless somebody looks, soonest (and most overdue)
 * first.
 */
export function FamilyPlanningDueCard({ patientBasePath }: FamilyPlanningDueCardProps) {
  const t = useTranslations();
  const format = useFormatter();
  const dueQuery = useFamilyPlanningDue(true);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-sm font-semibold text-slate-700">
          {t('maternalCare.familyPlanning.due.title')}
          <span className="ml-2 text-xs font-normal text-slate-400">
            {format.number(dueQuery.items.length)}
          </span>
        </h2>
        <p className="text-xs text-slate-500">{t('maternalCare.familyPlanning.due.subtitle')}</p>
      </div>
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          {dueQuery.isPending ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : dueQuery.items.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {dueQuery.items.map((item) => (
                <FamilyPlanningDueRow
                  key={item.familyPlanningRecordId}
                  item={item}
                  patientBasePath={patientBasePath}
                />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              {dueQuery.isError
                ? t('maternalCare.familyPlanning.loadError')
                : t('maternalCare.familyPlanning.due.empty')}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
