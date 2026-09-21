'use client';

import type { FamilyPlanningServiceView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type FamilyPlanningServiceRowProps = {
  service: FamilyPlanningServiceView;
};

/** One follow-up of a KB course: when, what was done, and when she is due back. */
export function FamilyPlanningServiceRow({ service }: FamilyPlanningServiceRowProps) {
  const t = useTranslations();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
      <span className="text-slate-600">{service.servedOn}</span>
      <span className="min-w-0 flex-1 text-slate-900">{service.action}</span>
      <span className="text-slate-500">
        {service.nextDueOn ?? t('maternalCare.familyPlanning.noDueDate')}
      </span>
    </li>
  );
}
