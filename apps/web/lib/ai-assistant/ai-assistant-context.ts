'use client';

import { createContext, useContext } from 'react';

import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';
import type { ConversationMessage } from '#lib/ai-assistant/conversation-types';
import type { SendConversationMessageInput } from '#lib/ai-assistant/use-conversation';

export type AiAssistantContextValue = {
  messages: ConversationMessage[];
  isReplying: boolean;
  /** The session the thread is currently attached to, once one exists. */
  activeSessionId: string | null;
  isTranscriptLoading: boolean;
  hasTranscriptFailed: boolean;
  /** Assistant replies that landed while the assistant screen was not open. */
  unreadCount: number;
  sendUserMessage: (input: SendConversationMessageInput) => void;
  retryFailedMessage: (messageId: string) => void;
  startNewConsultation: () => void;
  openConsultation: (entry: ConsultationHistoryEntry) => void;
};

export const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

/**
 * The conversation, for the assistant screen itself. Throws outside the
 * provider: a panel with no conversation behind it is a bug, not a state to
 * render around.
 */
export function useAiAssistant(): AiAssistantContextValue {
  const value = useContext(AiAssistantContext);
  if (value === null) {
    throw new Error('useAiAssistant must be used inside an AiAssistantProvider');
  }
  return value;
}

/**
 * The same conversation for bystanders — nav badges and launchers that live in
 * shells which may not mount the provider at all. They get `null` and render
 * nothing rather than taking down the whole shell.
 */
export function useOptionalAiAssistant(): AiAssistantContextValue | null {
  return useContext(AiAssistantContext);
}
