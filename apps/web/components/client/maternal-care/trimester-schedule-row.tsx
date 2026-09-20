'use client';

import type { TrimesterScheduleEntry } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { TRIMESTER_STATE_CLASSES } from '#lib/maternal-care/trimester-state-classes';

type TrimesterScheduleRowProps = {
  entry: TrimesterScheduleEntry;
};

/**
 * One trimester's line. The doctor-visit chip is separate from the count on
 * purpose: a trimester can be complete on visits and still owe the dokter or
 * SpOG contact Pasal 13(4)–(5) requires.
 */
export function TrimesterScheduleRow({ entry }: TrimesterScheduleRowProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
      <span className="text-sm font-medium text-slate-900">
        {t('maternalCare.schedule.trimester', { trimester: entry.trimester })}
      </span>
      <span className="text-sm text-slate-600">
        {t('maternalCare.schedule.count', {
          completed: entry.completedVisitCount,
          required: entry.requiredVisitCount,
        })}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRIMESTER_STATE_CLASSES[entry.state]}`}
      >
        {t(`maternalCare.schedule.states.${entry.state}`)}
      </span>
      {entry.doctorVisit ? (
        <span className="text-xs text-slate-500">
          {t('maternalCare.schedule.doctorVisit.label')}:{' '}
          {entry.doctorVisit.isMet
            ? t('maternalCare.schedule.doctorVisit.met')
            : t('maternalCare.schedule.doctorVisit.notMet')}
          {entry.doctorVisit.isMet
            ? ` · ${
                entry.doctorVisit.isUltrasoundRecorded
                  ? t('maternalCare.schedule.doctorVisit.ultrasoundRecorded')
                  : t('maternalCare.schedule.doctorVisit.ultrasoundUnknown')
              }`
            : ''}
        </span>
      ) : null}
    </div>
  );
}
