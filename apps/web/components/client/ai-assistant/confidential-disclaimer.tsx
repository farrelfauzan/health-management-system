'use client';

import { useTranslations } from 'next-intl';

export function ConfidentialDisclaimer() {
  const t = useTranslations('aiAssistant.disclaimer');
  return (
    <p className="mx-auto mt-3 max-w-2xl text-center text-[11px] leading-tight text-slate-500">
      <span className="font-bold text-rose-600">{t('label')}</span> {t('body')}
    </p>
  );
}
