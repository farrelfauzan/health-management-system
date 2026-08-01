'use client';

import { useTranslations } from 'next-intl';

import { ConsultationHistoryItem } from '#components/client/ai-assistant/consultation-history-item';
import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';

type ConsultationHistoryListProps = {
  entries: ConsultationHistoryEntry[];
  activeSessionId: string | null;
  isLoading: boolean;
  hasFailed: boolean;
  onSelect: (entry: ConsultationHistoryEntry) => void;
};

/**
 * The recent-consultation list and its three empty-looking states, kept
 * visibly distinct: "still loading", "you have none", and "we could not ask"
 * are different facts about the user's data, and rendering one blank div for
 * all three tells them nothing.
 */
export function ConsultationHistoryList({
  entries,
  activeSessionId,
  isLoading,
  hasFailed,
  onSelect,
}: ConsultationHistoryListProps) {
  const t = useTranslations('aiAssistant.sidebar');
  if (isLoading) {
    return <p className="px-2 py-3 text-sm text-slate-500">{t('historyLoading')}</p>;
  }
  if (hasFailed) {
    return (
      <p role="status" className="px-2 py-3 text-sm text-destructive">
        {t('historyError')}
      </p>
    );
  }
  if (entries.length === 0) {
    return <p className="px-2 py-3 text-sm text-slate-500">{t('historyEmpty')}</p>;
  }
  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <ConsultationHistoryItem
          key={entry.id}
          entry={entry}
          isActive={entry.id === activeSessionId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
