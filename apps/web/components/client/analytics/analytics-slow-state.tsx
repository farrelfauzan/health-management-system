'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type AnalyticsSlowStateProps = {
  onRetry: () => void;
  onPickThreeMonths: () => void;
};

/**
 * The API gave up after ten seconds. Said in plain words, with the two ways
 * out, and with the reassurance that the rest of the clinic is unaffected.
 */
export function AnalyticsSlowState({ onRetry, onPickThreeMonths }: AnalyticsSlowStateProps) {
  const t = useTranslations('analytics.states');
  return (
    <section
      role="alert"
      className="flex flex-col gap-4 rounded-[14px] border border-slate-200 bg-white p-6"
    >
      <div className="flex items-start gap-3 rounded-xl bg-warning-tint px-4 py-3.5">
        <Icon name="hourglass_disabled" size={22} className="text-warning" />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold text-slate-900">{t('slowTitle')}</h2>
          <p className="text-[13px] leading-relaxed text-on-surface-variant">
            {t('slowDescription')}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onRetry}>
          <Icon name="refresh" size={18} />
          {t('retry')}
        </Button>
        <Button type="button" variant="ghost" onClick={onPickThreeMonths}>
          {t('pickThreeMonths')}
        </Button>
      </div>
    </section>
  );
}
