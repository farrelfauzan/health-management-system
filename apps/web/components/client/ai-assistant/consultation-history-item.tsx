'use client';

import { Button, Can, Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';

type ConsultationHistoryItemProps = {
  entry: ConsultationHistoryEntry;
  isActive: boolean;
  onSelect: (entry: ConsultationHistoryEntry) => void;
  onRequestDelete: (entry: ConsultationHistoryEntry) => void;
};

/**
 * A row, not a button: the delete control is itself a button, and nesting one
 * inside another is invalid markup that keyboard and screen-reader users pay
 * for. The row is a flex container holding two real controls instead.
 */
export function ConsultationHistoryItem({
  entry,
  isActive,
  onSelect,
  onRequestDelete,
}: ConsultationHistoryItemProps) {
  const t = useTranslations('aiAssistant.sidebar');
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-surface-container-low',
        isActive && 'bg-primary-container',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(entry)}
        aria-current={isActive ? 'true' : undefined}
        aria-label={t('openConsultation', { title: entry.title })}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-3 text-left text-sm',
          isActive ? 'font-medium text-on-primary-container' : 'text-slate-600',
        )}
      >
        <Icon
          name="history"
          size={18}
          className={cn('shrink-0', isActive ? 'text-current' : 'text-slate-400')}
        />
        <span className="truncate">{entry.title}</span>
      </button>
      <Can action="delete" subject="ChatSession">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onRequestDelete(entry)}
          aria-label={t('deleteConsultation', { title: entry.title })}
          title={t('delete')}
          className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Icon name="delete" size={18} className="text-current" />
        </Button>
      </Can>
    </div>
  );
}
