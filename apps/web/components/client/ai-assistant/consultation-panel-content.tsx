'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ConsultationHistoryList } from '#components/client/ai-assistant/consultation-history-list';
import { SuggestedPromptCard } from '#components/client/ai-assistant/suggested-prompt-card';
import type { ConsultationPanelProps } from '#lib/ai-assistant/consultation-panel-props';

/**
 * The consultation panel's actual contents, independent of how it is being
 * presented. The desktop column and the mobile drawer both render this, so a
 * tablet user gets the same prompts and history the desktop has rather than
 * the nothing the old `lg:flex`-only sidebar gave them.
 */
export function ConsultationPanelContent({
  prompts,
  history,
  activeSessionId,
  isBusy,
  isHistoryLoading,
  hasHistoryFailed,
  onNewConsultation,
  onSelectPrompt,
  onSelectConsultation,
  onConsultationDeleted,
}: ConsultationPanelProps) {
  const t = useTranslations('aiAssistant.sidebar');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 p-4">
        <Button type="button" className="w-full" onClick={onNewConsultation}>
          <Icon name="add" size={20} className="text-current" />
          {t('newConsultation')}
        </Button>
      </div>
      <div className="flex-1 space-y-8 overflow-y-auto p-4">
        <section>
          <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {t('suggestedAnalysis')}
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
            {t('recentHistory')}
          </h4>
          <ConsultationHistoryList
            entries={history}
            activeSessionId={activeSessionId}
            isLoading={isHistoryLoading}
            hasFailed={hasHistoryFailed}
            onSelect={onSelectConsultation}
            onDeleted={onConsultationDeleted}
          />
        </section>
      </div>
    </div>
  );
}
