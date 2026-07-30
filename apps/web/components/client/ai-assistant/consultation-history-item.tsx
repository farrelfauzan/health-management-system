'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { ConsultationHistoryEntry } from '#lib/ai-assistant/mock-recent-history';

type ConsultationHistoryItemProps = {
  entry: ConsultationHistoryEntry;
};

export function ConsultationHistoryItem({ entry }: ConsultationHistoryItemProps) {
  const t = useTranslations('aiAssistant.sidebar');
  return (
    <button
      type="button"
      disabled
      title={t('historyUnavailable')}
      className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-2 py-3 text-left text-sm text-slate-600 opacity-70"
    >
      <Icon name="history" size={18} className="shrink-0 text-slate-400" />
      <span className="truncate">{entry.title}</span>
    </button>
  );
}
