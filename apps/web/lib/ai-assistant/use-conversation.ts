import { useRef, useState } from 'react';

import type {
  AssistantMessageBody,
  ConversationMessage,
  ConversationService,
} from '#lib/ai-assistant/conversation-types';

const ASSISTANT_NAME = 'AI Clinical Assistant';
const SENT_AT_LABEL = 'Just now';

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

export function useConversation({ service, displayName }: UseConversationInput): UseConversationResult {
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
      authorName: ASSISTANT_NAME,
      sentAtLabel: SENT_AT_LABEL,
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
        sentAtLabel: SENT_AT_LABEL,
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
