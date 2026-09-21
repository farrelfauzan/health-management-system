'use client';

import type { FamilyPlanningCourseView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type FamilyPlanningHistoryRowProps = {
  course: FamilyPlanningCourseView;
};

/** A discontinued KB course: the method, how long it ran, and why it ended. */
export function FamilyPlanningHistoryRow({ course }: FamilyPlanningHistoryRowProps) {
  const t = useTranslations();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
      <span className="text-slate-900">
        {t(`maternalCare.familyPlanning.methods.${course.method}`)}
      </span>
      <span className="text-slate-600">
        {course.startedOn} – {course.discontinuedOn ?? '—'}
      </span>
      <span className="text-slate-500">
        {course.discontinuationReason === null
          ? '—'
          : t(`maternalCare.familyPlanning.reasons.${course.discontinuationReason}`)}
      </span>
    </li>
  );
}
