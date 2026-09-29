'use client';

import { cn, Icon } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import type { AnalyticsDelta } from '#lib/analytics/analytics-filter-state';
import { formatRupiah } from '#lib/analytics/format-rupiah';
import { formatSignedNumber } from '#lib/analytics/format-signed-number';

type AnalyticsDeltaLineProps = {
  delta: AnalyticsDelta;
  previousLabel: string;
};

const ARROW_BY_DIRECTION: Readonly<Record<AnalyticsDelta['direction'], string>> = {
  up: 'arrow_upward',
  down: 'arrow_downward',
  flat: 'arrow_forward',
};

const TONE_CLASSES: Readonly<Record<AnalyticsDelta['tone'], string>> = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-slate-500',
};

/**
 * The arrow, the signed change and what it is against. Colour only repeats
 * what the arrow and the sign already say, and the direction is spoken for
 * screen readers.
 */
export function AnalyticsDeltaLine({ delta, previousLabel }: AnalyticsDeltaLineProps) {
  const t = useTranslations('analytics.delta');
  const locale = useLocale();
  const signed =
    delta.kind === 'rupiah'
      ? formatRupiah(delta.value, locale, { isCompact: true, isSigned: true })
      : formatSignedNumber(delta.value, locale);
  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      <span className={cn('flex items-center gap-0.5 font-semibold', TONE_CLASSES[delta.tone])}>
        <Icon name={ARROW_BY_DIRECTION[delta.direction]} size={16} />
        <span className="sr-only">{t(delta.direction)}</span>
        {t(delta.kind, { value: signed })}
      </span>
      <span className="text-slate-500">{t('vs', { value: previousLabel })}</span>
    </div>
  );
}
