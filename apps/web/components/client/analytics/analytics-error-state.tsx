'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type AnalyticsErrorStateProps = {
  onRetry: () => void;
};

/** Any other failure: a plain sentence and a way to try again, never an error code. */
export function AnalyticsErrorState({ onRetry }: AnalyticsErrorStateProps) {
  const t = useTranslations('analytics.states');
  return (
    <section
      role="alert"
      className="flex flex-col items-start gap-3 rounded-[14px] border border-slate-200 bg-white p-6"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon name="error" size={20} className="text-danger" />
        {t('errorTitle')}
      </h2>
      <p className="text-[13px] text-on-surface-variant">{t('errorDescription')}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        <Icon name="refresh" size={18} />
        {t('retry')}
      </Button>
    </section>
  );
}
