'use client';

import { Button, Icon } from '@hms/ui';

import { ConsultationHistoryItem } from '#components/client/ai-assistant/consultation-history-item';
import { SuggestedPromptCard } from '#components/client/ai-assistant/suggested-prompt-card';
import type { ConsultationHistoryEntry } from '#lib/ai-assistant/mock-recent-history';
import type { SuggestedPrompt } from '#lib/ai-assistant/mock-suggested-prompts';

type ConsultationSidebarProps = {
  prompts: SuggestedPrompt[];
  history: ConsultationHistoryEntry[];
  isBusy: boolean;
  onNewConsultation: () => void;
  onSelectPrompt: (prompt: SuggestedPrompt) => void;
};

export function ConsultationSidebar({
  prompts,
  history,
  isBusy,
  onNewConsultation,
  onSelectPrompt,
}: ConsultationSidebarProps) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="border-b border-slate-200 p-4">
        <Button type="button" className="w-full" onClick={onNewConsultation}>
          <Icon name="add" size={20} className="text-current" />
          New Consultation
        </Button>
      </div>
      <div className="flex-1 space-y-8 overflow-y-auto p-4">
        <section>
          <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Suggested Analysis
          </h4>
          <div className="space-y-2">
            {prompts.map((prompt) => (
              <SuggestedPromptCard
                key={prompt.id}
                prompt={prompt}
                isDisabled={isBusy}
                onSelect={onSelectPrompt}
              />
            ))}
          </div>
        </section>
        <section>
          <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Recent History
          </h4>
          <div className="space-y-1">
            {history.map((entry) => (
              <ConsultationHistoryItem key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
