'use client';

import { useFormatter, useTranslations } from 'next-intl';

import { LabResultRow } from '#components/client/laboratory/lab-result-row';
import type { LabResultGroup } from '#lib/laboratory/group-lab-results-by-order';

type LabResultsGroupProps = {
  group: LabResultGroup;
  patientId: string;
  isTrendEnabled?: boolean;
};

/**
 * The values from one request, under the number that request is known by
 * (`P18-T07`).
 *
 * Grouped rather than flat because that is how a doctor reads them: "the darah
 * rutin from Tuesday" is one thing with six numbers in it, not six values that
 * happen to share a date.
 */
export function LabResultsGroup({ group, patientId, isTrendEnabled }: LabResultsGroupProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();

  return (
    <section className="space-y-2">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-heading text-sm font-medium text-slate-700">{group.orderNumber}</p>
        <p className="text-xs text-slate-500">
          {group.releasedAt
            ? t('encounters.laboratory.result.releasedAt', {
                releasedAt: format.dateTime(new Date(group.releasedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })
            : null}
        </p>
      </header>
      <ul className="space-y-2">
        {group.results.map((result) => (
          <LabResultRow
            key={result.id}
            result={result}
            patientId={patientId}
            isTrendEnabled={isTrendEnabled}
          />
        ))}
      </ul>
    </section>
  );
}
