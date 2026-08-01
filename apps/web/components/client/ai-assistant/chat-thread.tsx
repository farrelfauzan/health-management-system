'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { AssistantMessage } from '#components/client/ai-assistant/assistant-message';
import { ConversationErrorMessage } from '#components/client/ai-assistant/conversation-error-message';
import { TypingIndicator } from '#components/client/ai-assistant/typing-indicator';
import { UserMessage } from '#components/client/ai-assistant/user-message';
import type { ConversationMessage } from '#lib/ai-assistant/conversation-types';

type ChatThreadProps = {
  messages: ConversationMessage[];
  isReplying: boolean;
  onRetry: (messageId: string) => void;
};

export function ChatThread({ messages, isReplying, onRetry }: ChatThreadProps) {
  const t = useTranslations('aiAssistant.conversation');
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, isReplying]);
  return (
    <div role="log" aria-label={t('label')} className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
      {messages.map((message) => {
        if (message.role === 'assistant') {
          return <AssistantMessage key={message.id} message={message} />;
        }
        if (message.role === 'error') {
          return (
            <ConversationErrorMessage
              key={message.id}
              message={message}
              isBusy={isReplying}
              onRetry={onRetry}
            />
          );
        }
        return <UserMessage key={message.id} message={message} />;
      })}
      {isReplying ? <TypingIndicator /> : null}
      <div ref={threadEndRef} />
    </div>
  );
}
