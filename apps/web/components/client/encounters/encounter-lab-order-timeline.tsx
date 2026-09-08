'use client';

import type { LabOrderStatusValue } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  LAB_ORDER_STATUS_STEPS,
  toLabOrderStepIndex,
} from '#lib/laboratory/lab-order-status-steps';

type EncounterLabOrderTimelineProps = {
  status: LabOrderStatusValue;
};

/**
 * Where a request has got to, as four dots (`P18-T07`).
 *
 * The question this answers is the one a doctor actually asks — "is it worth
 * waiting for this before I finish?" — so it draws the wait rather than the
 * status word. A cancelled order shows no timeline at all: it left the path
 * instead of reaching the end of it, and a filled last dot would read as
 * completion.
 */
export function EncounterLabOrderTimeline({ status }: EncounterLabOrderTimelineProps) {
  const t = useTranslations('clinical');

  if (status === 'CANCELLED') {
    return null;
  }

  const currentIndex = toLabOrderStepIndex(status);

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {LAB_ORDER_STATUS_STEPS.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full',
              index <= currentIndex ? 'bg-primary' : 'bg-slate-300',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'text-xs',
              index <= currentIndex ? 'font-medium text-slate-700' : 'text-slate-400',
            )}
          >
            {t(`encounters.laboratory.step.${step}`)}
          </span>
          {index < LAB_ORDER_STATUS_STEPS.length - 1 ? (
            <span className="h-px w-4 bg-slate-200" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
