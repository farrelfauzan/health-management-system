'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ChatComposer } from '#components/client/ai-assistant/chat-composer';
import { ChatThread } from '#components/client/ai-assistant/chat-thread';
import { ConfidentialDisclaimer } from '#components/client/ai-assistant/confidential-disclaimer';
import { ConsultationSidebar } from '#components/client/ai-assistant/consultation-sidebar';
import { PageHeader } from '#components/shared/page-header';
import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';
import { createChatConversationService } from '#lib/ai-assistant/create-chat-conversation-service';
import { buildSuggestedPrompts, type SuggestedPrompt } from '#lib/ai-assistant/suggested-prompts';
import { useChatSessions } from '#lib/ai-assistant/use-chat-sessions';
import { useConversation } from '#lib/ai-assistant/use-conversation';
import type { AppLocale } from '../../../i18n/config';

type AiAssistantPanelProps = {
  displayName: string;
  channel?: 'PATIENT' | 'DOCTOR';
};

export function AiAssistantPanel({ displayName, channel = 'DOCTOR' }: AiAssistantPanelProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('aiAssistant.header');
  const tSidebar = useTranslations('aiAssistant.sidebar');
  const prompts = useMemo(() => buildSuggestedPrompts(locale), [locale]);
  /**
   * Bumped by "new consultation" so a fresh service — and therefore a fresh
   * server-side session — is built. The session id lives inside the service
   * instance, so replacing the instance is what starts a new conversation.
   */
  const [conversationEpoch, setConversationEpoch] = useState(0);
  const service = useMemo(
    () => createChatConversationService({ locale, channel }),
    // conversationEpoch is a deliberate dependency: it is the reset signal.
    [locale, channel, conversationEpoch],
  );
  const conversation = useConversation({ service, displayName });
  const sessionsQuery = useChatSessions();
  const history = useMemo<ConsultationHistoryEntry[]>(
    () =>
      (sessionsQuery.data ?? []).map((session) => ({
        id: session.id,
        title: session.title ?? tSidebar('untitledConsultation'),
      })),
    [sessionsQuery.data, tSidebar],
  );
  function handleSelectPrompt(prompt: SuggestedPrompt): void {
    conversation.sendUserMessage({ text: prompt.messageText, promptId: prompt.id });
  }
  function handleNewConsultation(): void {
    setConversationEpoch((previous) => previous + 1);
    conversation.resetConversation();
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumbs={[t('breadcrumbs.advanced'), t('breadcrumbs.assistant')]}
      />
      <section className="flex h-[calc(100vh-16rem)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ConsultationSidebar
          prompts={prompts}
          history={history}
          isBusy={conversation.isReplying}
          onNewConsultation={handleNewConsultation}
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
