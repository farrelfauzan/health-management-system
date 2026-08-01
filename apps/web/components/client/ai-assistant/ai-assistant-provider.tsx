'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import {
  getChatControllerGetAvailabilityV1QueryKey,
  getChatControllerListSessionsV1QueryKey,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { AiAssistantContext } from '#lib/ai-assistant/ai-assistant-context';
import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';
import { createChatConversationService } from '#lib/ai-assistant/create-chat-conversation-service';
import { formatTurnTime } from '#lib/ai-assistant/format-turn-time';
import { toConversationMessages } from '#lib/ai-assistant/to-conversation-messages';
import { useConversation, type ConversationSeed } from '#lib/ai-assistant/use-conversation';
import { useSessionTranscript } from '#lib/ai-assistant/use-session-transcript';
import type { AppLocale } from '../../../i18n/config';

type AiAssistantProviderProps = {
  displayName: string;
  channel?: 'PATIENT' | 'DOCTOR';
  /**
   * This shell's assistant route. Omitted by shells that have no assistant
   * screen, which hides their entry points rather than pointing them at a
   * route the request gate will bounce.
   */
  assistantPath?: string | null;
  children: ReactNode;
};

/**
 * Which conversation the thread is showing. `epoch` is the reset signal —
 * bumping it rebuilds the service, drops in-flight replies, and re-arms the
 * transcript seed — and `sessionId` is null for a consultation that has not
 * been created server-side yet.
 */
type ConversationSource = {
  epoch: number;
  sessionId: string | null;
};

/**
 * Conversation state, mounted above the route rather than inside the assistant
 * page. The page used to own it, so navigating away unmounted the thread and
 * an in-flight reply had nowhere to land — that dropped rejection was half of
 * the original crash. Living in the layout, a reply that arrives while the
 * user is elsewhere still lands, and announces itself instead.
 */
export function AiAssistantProvider({
  displayName,
  channel = 'DOCTOR',
  assistantPath = null,
  children,
}: AiAssistantProviderProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('aiAssistant');
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAssistantRouteActive = assistantPath !== null && pathname === assistantPath;
  const [source, setSource] = useState<ConversationSource>({ epoch: 0, sessionId: null });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // Read inside a callback that outlives the render it was created in, so it
  // has to be a ref: a reply can land several navigations after its send.
  const isAssistantRouteActiveRef = useRef(isAssistantRouteActive);
  const assistantName = t('conversation.assistantName');
  const replyReadyCopy = t('notification.replyReady');
  const openCopy = t('notification.open');
  useEffect(() => {
    isAssistantRouteActiveRef.current = isAssistantRouteActive;
    if (isAssistantRouteActive) {
      setUnreadCount(0);
    }
  }, [isAssistantRouteActive]);
  const handleSessionCreated = useCallback(
    (createdSessionId: string) => {
      setActiveSessionId(createdSessionId);
      void queryClient.invalidateQueries({ queryKey: getChatControllerListSessionsV1QueryKey() });
    },
    [queryClient],
  );
  const handleUnavailable = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: getChatControllerGetAvailabilityV1QueryKey(),
    });
  }, [queryClient]);
  const handleAssistantReply = useCallback(() => {
    if (isAssistantRouteActiveRef.current) {
      return;
    }
    setUnreadCount((previous) => previous + 1);
    toast.info(replyReadyCopy, {
      // No action when the shell has no assistant screen: a toast button that
      // navigates somewhere the request gate rejects is worse than no button.
      ...(assistantPath === null
        ? {}
        : { action: { label: openCopy, onClick: () => router.push(assistantPath) } }),
    });
  }, [assistantPath, openCopy, replyReadyCopy, router]);
  const service = useMemo(
    () =>
      createChatConversationService({
        locale,
        channel,
        ...(source.sessionId === null ? {} : { sessionId: source.sessionId }),
        onSessionCreated: handleSessionCreated,
      }),
    [locale, channel, source, handleSessionCreated],
  );
  const transcriptQuery = useSessionTranscript(source.sessionId);
  const transcript = transcriptQuery.data;
  const seed = useMemo<ConversationSeed | null>(() => {
    if (source.sessionId === null || transcript === undefined) {
      return null;
    }
    return {
      key: `${source.sessionId}#${source.epoch}`,
      messages: toConversationMessages({
        turns: transcript,
        displayName,
        assistantName,
        formatSentAt: (isoTimestamp) => formatTurnTime(isoTimestamp, locale),
      }),
    };
  }, [source, transcript, displayName, assistantName, locale]);
  const conversation = useConversation({
    service,
    displayName,
    seed,
    onUnavailable: handleUnavailable,
    onAssistantReply: handleAssistantReply,
  });
  const { resetConversation } = conversation;
  const startNewConsultation = useCallback(() => {
    setSource((previous) => ({ epoch: previous.epoch + 1, sessionId: null }));
    setActiveSessionId(null);
    resetConversation();
  }, [resetConversation]);
  const openConsultation = useCallback(
    (entry: ConsultationHistoryEntry) => {
      setSource((previous) => ({ epoch: previous.epoch + 1, sessionId: entry.id }));
      setActiveSessionId(entry.id);
      resetConversation();
    },
    [resetConversation],
  );
  const value = useMemo(
    () => ({
      assistantPath,
      messages: conversation.messages,
      isReplying: conversation.isReplying,
      activeSessionId,
      isTranscriptLoading: source.sessionId !== null && transcriptQuery.isPending,
      hasTranscriptFailed: transcriptQuery.isError,
      unreadCount,
      sendUserMessage: conversation.sendUserMessage,
      retryFailedMessage: conversation.retryFailedMessage,
      startNewConsultation,
      openConsultation,
    }),
    [
      assistantPath,
      conversation.messages,
      conversation.isReplying,
      conversation.sendUserMessage,
      conversation.retryFailedMessage,
      activeSessionId,
      source.sessionId,
      transcriptQuery.isPending,
      transcriptQuery.isError,
      unreadCount,
      startNewConsultation,
      openConsultation,
    ],
  );
  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}
