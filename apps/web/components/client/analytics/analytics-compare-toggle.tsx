'use client';

import { resolveAnalyticsComparisonPeriod } from '@hms/shared-types';
import { Checkbox } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useId } from 'react';

import type { AnalyticsPeriodRange } from '#lib/analytics/analytics-filter-state';
import { formatAnalyticsDateRange } from '#lib/analytics/format-analytics-date-range';

type AnalyticsCompareToggleProps = {
  range: AnalyticsPeriodRange;
  isChecked: boolean;
  onCheckedChange: (isChecked: boolean) => void;
};

/**
 * "Bandingkan dengan 1 – 31 Agu 2026": names the comparison period outright,
 * computed by the same rule the API uses, so nobody has to guess what the
 * percentages are against.
 */
export function AnalyticsCompareToggle({
  range,
  isChecked,
  onCheckedChange,
}: AnalyticsCompareToggleProps) {
  const t = useTranslations('analytics.filter');
  const format = useFormatter();
  const checkboxId = useId();
  const comparison = resolveAnalyticsComparisonPeriod(range);
  const comparisonLabel = formatAnalyticsDateRange(comparison, (value, options) =>
    format.dateTime(value, options),
  );
  return (
    <label
      htmlFor={checkboxId}
      className="flex h-[38px] cursor-pointer items-center gap-2.5 text-[13px] text-slate-900"
    >
      <Checkbox
        id={checkboxId}
        checked={isChecked}
        onCheckedChange={(checked) => onCheckedChange(checked === true)}
      />
      <span>
        {t.rich('compare', {
          range: comparisonLabel,
          strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
        })}
      </span>
    </label>
  );
}
