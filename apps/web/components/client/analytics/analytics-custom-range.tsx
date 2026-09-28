'use client';

import { DatePicker, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import type { AnalyticsPeriodRange } from '#lib/analytics/analytics-filter-state';
import type { AnalyticsRangeProblem } from '#lib/analytics/validate-analytics-filter-range';

type AnalyticsCustomRangeProps = {
  range: AnalyticsPeriodRange;
  problem: AnalyticsRangeProblem | null;
  onChange: (range: AnalyticsPeriodRange) => void;
};

const PROBLEM_MESSAGE_KEY: Readonly<
  Record<AnalyticsRangeProblem, 'rangeTooLong' | 'endBeforeStart'>
> = {
  'range-too-long': 'rangeTooLong',
  'end-before-start': 'endBeforeStart',
};

/**
 * Two dates for a custom period. A range the API would refuse is said here,
 * under the fields, and never sent.
 */
export function AnalyticsCustomRange({ range, problem, onChange }: AnalyticsCustomRangeProps) {
  const t = useTranslations('analytics.filter');
  const errorId = useId();
  const describedBy = problem ? errorId : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          value={range.from}
          onValueChange={(from) => onChange({ ...range, from })}
          aria-label={t('customFrom')}
          aria-invalid={problem !== null}
          aria-describedby={describedBy}
          className="w-40"
        />
        <span aria-hidden="true" className="text-slate-400">
          –
        </span>
        <DatePicker
          value={range.to}
          onValueChange={(to) => onChange({ ...range, to })}
          aria-label={t('customTo')}
          aria-invalid={problem !== null}
          aria-describedby={describedBy}
          className="w-40"
        />
      </div>
      {problem ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
          <Icon name="error" size={16} />
          {t(PROBLEM_MESSAGE_KEY[problem])}
        </p>
      ) : null}
    </div>
  );
}
