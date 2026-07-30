import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import type {
  AssistantMessageBody,
  ConversationMessage,
  ConversationService,
} from '#lib/ai-assistant/conversation-types';

export type SendConversationMessageInput = {
  text: string;
  promptId?: string;
};

type UseConversationInput = {
  service: ConversationService;
  displayName: string;
};

type UseConversationResult = {
  messages: ConversationMessage[];
  isReplying: boolean;
  sendUserMessage: (input: SendConversationMessageInput) => void;
  resetConversation: () => void;
};

export function useConversation({
  service,
  displayName,
}: UseConversationInput): UseConversationResult {
  const t = useTranslations('aiAssistant.conversation');
  const messageCountRef = useRef(0);
  const conversationEpochRef = useRef(0);
  const [messages, setMessages] = useState<ConversationMessage[]>(() => [
    buildAssistantMessage(service.buildGreeting({ displayName })),
  ]);
  const [isReplying, setIsReplying] = useState(false);
  function buildMessageId(): string {
    messageCountRef.current += 1;
    return `message-${conversationEpochRef.current}-${messageCountRef.current}`;
  }
  function buildAssistantMessage(body: AssistantMessageBody): ConversationMessage {
    return {
      id: buildMessageId(),
      role: 'assistant',
      authorName: t('assistantName'),
      sentAtLabel: t('justNow'),
      body,
    };
  }
  function sendUserMessage({ text, promptId }: SendConversationMessageInput): void {
    const trimmedText = text.trim();
    if (!trimmedText || isReplying) {
      return;
    }
    const epoch = conversationEpochRef.current;
    setMessages((previous) => [
      ...previous,
      {
        id: buildMessageId(),
        role: 'user',
        authorName: displayName,
        sentAtLabel: t('justNow'),
        text: trimmedText,
      },
    ]);
    setIsReplying(true);
    void service.requestReply({ text: trimmedText, promptId }).then((body) => {
      if (conversationEpochRef.current !== epoch) {
        return;
      }
      setMessages((previous) => [...previous, buildAssistantMessage(body)]);
      setIsReplying(false);
    });
  }
  function resetConversation(): void {
    conversationEpochRef.current += 1;
    setMessages([buildAssistantMessage(service.buildGreeting({ displayName }))]);
    setIsReplying(false);
  }
  return { messages, isReplying, sendUserMessage, resetConversation };
}
