'use client';

import { useMemo } from 'react';

import { ChatComposer } from '#components/client/ai-assistant/chat-composer';
import { ChatThread } from '#components/client/ai-assistant/chat-thread';
import { ConfidentialDisclaimer } from '#components/client/ai-assistant/confidential-disclaimer';
import { ConsultationSidebar } from '#components/client/ai-assistant/consultation-sidebar';
import { PreviewBadge } from '#components/client/ai-assistant/preview-badge';
import { PageHeader } from '#components/shared/page-header';
import { createMockConversationService } from '#lib/ai-assistant/mock-conversation-service';
import { MOCK_RECENT_HISTORY } from '#lib/ai-assistant/mock-recent-history';
import { MOCK_SUGGESTED_PROMPTS, type SuggestedPrompt } from '#lib/ai-assistant/mock-suggested-prompts';
import { useConversation } from '#lib/ai-assistant/use-conversation';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

type AiAssistantPanelProps = {
  displayName: string;
  replyDelayMs?: number;
};

export function AiAssistantPanel({ displayName, replyDelayMs }: AiAssistantPanelProps) {
  const metadata = ADMIN_ROUTE_METADATA['ai-assistant'];
  const service = useMemo(
    () =>
      createMockConversationService(replyDelayMs === undefined ? {} : { replyDelayMs }),
    [replyDelayMs],
  );
  const conversation = useConversation({ service, displayName });
  function handleSelectPrompt(prompt: SuggestedPrompt): void {
    conversation.sendUserMessage({ text: prompt.messageText, promptId: prompt.id });
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={[...metadata.breadcrumbs]}
        actions={<PreviewBadge />}
      />
      <section className="flex h-[calc(100vh-16rem)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ConsultationSidebar
          prompts={MOCK_SUGGESTED_PROMPTS}
          history={MOCK_RECENT_HISTORY}
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
