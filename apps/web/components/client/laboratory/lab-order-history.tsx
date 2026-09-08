'use client';

import type { LabOrderView, LabResultView } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { EmptyState } from '#components/shared/empty-state';
import { buildLabOrderHistory } from '#lib/laboratory/build-lab-order-history';

type LabOrderHistoryProps = {
  order: LabOrderView;
  results: readonly LabResultView[];
};

/** What has happened on this order, newest first, read off the record's own timestamps. */
export function LabOrderHistory({ order, results }: LabOrderHistoryProps) {
  const t = useTranslations('operations.laboratory.history');
  const format = useFormatter();
  const events = buildLabOrderHistory({ order, results });

  if (events.length === 0) {
    return <EmptyState icon="history" title={t('empty')} />;
  }

  return (
    <ol className="space-y-2">
      {events.map((event) => (
        <li key={event.key} className="flex items-baseline gap-3 text-sm">
          <span className="w-40 shrink-0 text-xs text-slate-500">
            {format.dateTime(new Date(event.at), { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <span className="text-slate-800">{t(`events.${event.kind}`, event.values)}</span>
        </li>
      ))}
    </ol>
  );
}
