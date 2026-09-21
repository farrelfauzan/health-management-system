'use client';

import type { FamilyPlanningDueItem } from '@hms/shared-types';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type FamilyPlanningDueRowProps = {
  item: FamilyPlanningDueItem;
  patientBasePath: string;
};

/** One patient due back for KB: who, which method, and how soon or how late. */
export function FamilyPlanningDueRow({ item, patientBasePath }: FamilyPlanningDueRowProps) {
  const t = useTranslations();
  const isOverdue = item.daysUntilDue < 0;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <Link
        href={`${patientBasePath}/${item.patientId}?tab=family-planning`}
        className="min-w-0 flex-1 font-medium text-slate-900 hover:underline"
      >
        {item.patientName}
        <span className="ml-2 text-xs font-normal text-slate-400">{item.medicalRecordNumber}</span>
      </Link>
      <span className="text-slate-600">
        {t(`maternalCare.familyPlanning.methods.${item.method}`)}
      </span>
      <span className="text-slate-600">{item.nextDueOn}</span>
      <span
        className={
          isOverdue
            ? 'rounded-full bg-danger-tint px-2 py-0.5 text-xs text-danger'
            : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
        }
      >
        {isOverdue
          ? t('maternalCare.familyPlanning.due.overdueDays', { count: -item.daysUntilDue })
          : t('maternalCare.familyPlanning.due.inDays', { count: item.daysUntilDue })}
      </span>
    </li>
  );
}
