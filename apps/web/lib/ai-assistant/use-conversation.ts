import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import type {
  AssistantMessageBody,
  ConversationMessage,
  ConversationReplyRequest,
  ConversationService,
  ErrorConversationMessage,
} from '#lib/ai-assistant/conversation-types';
import { isChatUnavailableError } from '#lib/ai-assistant/is-chat-unavailable-error';

export type SendConversationMessageInput = ConversationReplyRequest;

/**
 * A past consultation's turns, replacing the thread once they arrive. `key`
 * identifies the load, not the session: reopening the same consultation after
 * a reset carries a fresh key, so the seed applies again rather than being
 * mistaken for one already consumed.
 */
export type ConversationSeed = {
  key: string;
  messages: ConversationMessage[];
};

type UseConversationInput = {
  service: ConversationService;
  displayName: string;
  seed?: ConversationSeed | null;
  /**
   * Called when a send failed because chat is switched off rather than because
   * the network dropped, so the caller can refresh availability and let the
   * notice explain it instead of the thread offering a pointless retry.
   */
  onUnavailable?: () => void;
  /** Called with each assistant reply that lands, for unread/toast handling. */
  onAssistantReply?: () => void;
};

type UseConversationResult = {
  messages: ConversationMessage[];
  isReplying: boolean;
  sendUserMessage: (input: SendConversationMessageInput) => void;
  retryFailedMessage: (messageId: string) => void;
  resetConversation: () => void;
};

export function useConversation({
  service,
  displayName,
  seed = null,
  onUnavailable,
  onAssistantReply,
}: UseConversationInput): UseConversationResult {
  const t = useTranslations('aiAssistant.conversation');
  const messageCountRef = useRef(0);
  const conversationEpochRef = useRef(0);
  const seededKeyRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>(() => [
    buildAssistantMessage(service.buildGreeting({ displayName })),
  ]);
  const [isReplying, setIsReplying] = useState(false);
  useEffect(() => {
    if (seed === null || seededKeyRef.current === seed.key) {
      return;
    }
    // Seeding once per key is what keeps a background refetch of the
    // transcript from wiping turns the user has added since it opened.
    seededKeyRef.current = seed.key;
    setMessages(seed.messages);
  }, [seed]);
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
  function handleReplyFailure(error: unknown, request: ConversationReplyRequest): void {
    if (isChatUnavailableError(error)) {
      onUnavailable?.();
      return;
    }
    setMessages((previous) => [...previous, { id: buildMessageId(), role: 'error', request }]);
  }
  /**
   * The one settlement path for a send. Success, transport failure, and policy
   * failure all leave through here, so no route can leave `isReplying` true —
   * that stuck flag disabled the composer for the rest of the page's life and
   * was the worse half of the original bug. The epoch guard keeps a reply that
   * outlived its conversation from being adopted by the next one.
   */
  async function deliverMessage(request: ConversationReplyRequest): Promise<void> {
    const epoch = conversationEpochRef.current;
    setIsReplying(true);
    try {
      const body = await service.requestReply(request);
      if (conversationEpochRef.current === epoch) {
        setMessages((previous) => [...previous, buildAssistantMessage(body)]);
        onAssistantReply?.();
      }
    } catch (error) {
      if (conversationEpochRef.current === epoch) {
        handleReplyFailure(error, request);
      }
    } finally {
      if (conversationEpochRef.current === epoch) {
        setIsReplying(false);
      }
    }
  }
  function sendUserMessage({ text, promptId }: SendConversationMessageInput): void {
    const trimmedText = text.trim();
    if (!trimmedText || isReplying) {
      return;
    }
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
    // `deliverMessage` settles every outcome itself, so this promise genuinely
    // cannot reject — unlike the `void` it replaces, which silenced the lint
    // rule while dropping real rejections on the floor.
    void deliverMessage({ text: trimmedText, promptId });
  }
  function retryFailedMessage(messageId: string): void {
    const failed = messages.find(
      (message): message is ErrorConversationMessage =>
        message.role === 'error' && message.id === messageId,
    );
    if (!failed || isReplying) {
      return;
    }
    setMessages((previous) => previous.filter((message) => message.id !== messageId));
    void deliverMessage(failed.request);
  }
  function resetConversation(): void {
    conversationEpochRef.current += 1;
    seededKeyRef.current = null;
    setMessages([buildAssistantMessage(service.buildGreeting({ displayName }))]);
    setIsReplying(false);
  }
  return { messages, isReplying, sendUserMessage, retryFailedMessage, resetConversation };
}
