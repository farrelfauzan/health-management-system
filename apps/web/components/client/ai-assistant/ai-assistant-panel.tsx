'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ChatComposer } from '#components/client/ai-assistant/chat-composer';
import { ChatThread } from '#components/client/ai-assistant/chat-thread';
import { ConfidentialDisclaimer } from '#components/client/ai-assistant/confidential-disclaimer';
import { ConsultationSidebar } from '#components/client/ai-assistant/consultation-sidebar';
import { PreviewBadge } from '#components/client/ai-assistant/preview-badge';
import { PageHeader } from '#components/shared/page-header';
import { createMockConversationService } from '#lib/ai-assistant/mock-conversation-service';
import { buildMockRecentHistory } from '#lib/ai-assistant/mock-recent-history';
import {
  buildMockSuggestedPrompts,
  type SuggestedPrompt,
} from '#lib/ai-assistant/mock-suggested-prompts';
import { useConversation } from '#lib/ai-assistant/use-conversation';
import type { AppLocale } from '../../../i18n/config';

type AiAssistantPanelProps = {
  displayName: string;
  replyDelayMs?: number;
};

export function AiAssistantPanel({ displayName, replyDelayMs }: AiAssistantPanelProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('aiAssistant.header');
  const prompts = useMemo(() => buildMockSuggestedPrompts(locale), [locale]);
  const history = useMemo(() => buildMockRecentHistory(locale), [locale]);
  const service = useMemo(
    () =>
      createMockConversationService(
        replyDelayMs === undefined ? { locale } : { replyDelayMs, locale },
      ),
    [locale, replyDelayMs],
  );
  const conversation = useConversation({ service, displayName });
  function handleSelectPrompt(prompt: SuggestedPrompt): void {
    conversation.sendUserMessage({ text: prompt.messageText, promptId: prompt.id });
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[t('breadcrumbs.advanced'), t('breadcrumbs.assistant')]}
        actions={<PreviewBadge />}
      />
      <section className="flex h-[calc(100vh-16rem)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ConsultationSidebar
          prompts={prompts}
          history={history}
          isBusy={conversation.isReplying}
          onNewConsultation={conversation.resetConversation}
          onSelectPrompt={handleSelectPrompt}
        />
        <div className="flex min-w-0 flex-1 flex-col bg-surface-bright">
          <ChatThread messages={conversation.messages} isReplying={conversation.isReplying} />
          <div className="px-6 pb-4">
            <ChatComposer
              isBusy={conversation.isReplying}
              onSend={(text) => conversation.sendUserMessage({ text })}
            />
            <ConfidentialDisclaimer />
          </div>
        </div>
      </section>
    </div>
  );
}
