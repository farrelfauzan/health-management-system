'use client';

import type { PostnatalScheduleEntry } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { POSTNATAL_STATUS_CLASSES } from '#lib/maternal-care/postnatal-status-classes';

type PostnatalScheduleChipProps = {
  entry: PostnatalScheduleEntry;
};

/** One KF or KN window: its code, its dates, and where it stands (P25-T12). */
export function PostnatalScheduleChip({ entry }: PostnatalScheduleChipProps) {
  const t = useTranslations('maternalCare.postnatal');
  const format = useFormatter();
  const formatInstant = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-100 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{entry.code}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${POSTNATAL_STATUS_CLASSES[entry.status]}`}
        >
          {t(`statuses.${entry.status}`)}
        </span>
      </div>
      <span className="text-xs text-slate-500">
        {t('windowRange', { start: formatInstant(entry.startsAt), end: formatInstant(entry.endsAt) })}
      </span>
      {entry.fulfilledBy ? (
        <span className="text-xs text-slate-600">
          {t('fulfilledAt', { at: formatInstant(entry.fulfilledBy.startedAt) })}
        </span>
      ) : null}
    </div>
  );
}
