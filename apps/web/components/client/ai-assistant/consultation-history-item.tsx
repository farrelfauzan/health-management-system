'use client';

import { Icon } from '@hms/ui';

import type { ConsultationHistoryEntry } from '#lib/ai-assistant/mock-recent-history';

type ConsultationHistoryItemProps = {
  entry: ConsultationHistoryEntry;
};

export function ConsultationHistoryItem({ entry }: ConsultationHistoryItemProps) {
  return (
    <button
      type="button"
      disabled
      title="Consultation history is not available in the preview"
      className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-2 py-3 text-left text-sm text-slate-600 opacity-70"
    >
      <Icon name="history" size={18} className="shrink-0 text-slate-400" />
      <span className="truncate">{entry.title}</span>
    </button>
  );
}
