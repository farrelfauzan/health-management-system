'use client';

import type { AnalyticsCount } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

type AnalyticsClinicalCountProps = {
  count: AnalyticsCount;
};

/**
 * A clinical count, or "<5" when the API withheld it (P29-T12). The reason is
 * spoken and shown on hover, so the gap never reads as a missing number.
 */
export function AnalyticsClinicalCount({ count }: AnalyticsClinicalCountProps) {
  const t = useTranslations('analytics.caseMix');
  const format = useFormatter();
  if (typeof count === 'number') {
    return <>{format.number(count)}</>;
  }
  return (
    <span title={t('suppressedNote')}>
      {t('suppressed')}
      <span className="sr-only"> — {t('suppressedNote')}</span>
    </span>
  );
}
