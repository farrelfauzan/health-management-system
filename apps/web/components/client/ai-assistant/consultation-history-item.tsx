'use client';

import { Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';

type ConsultationHistoryItemProps = {
  entry: ConsultationHistoryEntry;
  isActive: boolean;
  onSelect: (entry: ConsultationHistoryEntry) => void;
};

export function ConsultationHistoryItem({
  entry,
  isActive,
  onSelect,
}: ConsultationHistoryItemProps) {
  const t = useTranslations('aiAssistant.sidebar');
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      aria-current={isActive ? 'true' : undefined}
      aria-label={t('openConsultation', { title: entry.title })}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-3 text-left text-sm transition-colors hover:bg-surface-container-low',
        isActive ? 'bg-primary-container font-medium text-on-primary-container' : 'text-slate-600',
      )}
    >
      <Icon
        name="history"
        size={18}
        className={cn('shrink-0', isActive ? 'text-current' : 'text-slate-400')}
      />
      <span className="truncate">{entry.title}</span>
    </button>
  );
}
