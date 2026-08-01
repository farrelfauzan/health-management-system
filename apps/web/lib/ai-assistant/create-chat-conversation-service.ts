import type { ChatExchangeMeta, ChatExchangeView } from '@hms/shared-types';

import {
  chatControllerCreateSessionV1,
  chatControllerSendMessageV1,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { parseApiSuccess } from '#lib/api/response';
import type {
  AssistantMessageBody,
  ConversationReplyRequest,
  ConversationService,
} from '#lib/ai-assistant/conversation-types';
import type { AppLocale } from '../../i18n/config';
import { createAiAssistantTranslator } from '#lib/ai-assistant/localization';
import { toAssistantMessageBody } from '#lib/ai-assistant/to-assistant-message-body';

type CreateChatConversationServiceInput = {
  locale: AppLocale;
  channel?: 'PATIENT' | 'DOCTOR';
  /**
   * An existing session to continue. Supplied when the user reopens a past
   * consultation from the sidebar; omitted for a new one, which is created
   * lazily on the first send.
   */
  sessionId?: string;
  /**
   * Fires once, with the id, when this service creates a session. The caller
   * uses it to refresh the recent-consultation list — without it a user who
   * has just had a conversation cannot see it until a full page reload — and
   * to mark the new session active in the sidebar.
   */
  onSessionCreated?: (sessionId: string) => void;
};

type ChatSessionEnvelope = { id: string };

/**
 * The real Phase 13 conversation client, replacing the MVP mock behind the
 * same {@link ConversationService} interface the panel was written against.
 *
 * For a new conversation the session is created **lazily on the first
 * message**, not when the panel mounts: opening the assistant screen and
 * typing nothing should not consume a row or count against the clinic's daily
 * session quota. It is cached for the lifetime of the service instance, so a
 * conversation keeps its server-side transcript — and starting a new
 * consultation builds a new service, which is what starts a new session.
 *
 * Passing `sessionId` skips creation entirely and appends to that session
 * instead, which is what reopening a consultation from the sidebar does.
 *
 * The disclaimer is taken from the response envelope's `meta` and carried on
 * the message body rather than hardcoded in the UI: the server decides the
 * text, and a reply that arrived without one must not silently render as if
 * it had been shown.
 */
export function createChatConversationService({
  locale,
  channel = 'PATIENT',
  sessionId,
  onSessionCreated,
}: CreateChatConversationServiceInput): ConversationService {
  const t = createAiAssistantTranslator(locale);
  let sessionIdPromise: Promise<string> | null =
    sessionId === undefined ? null : Promise.resolve(sessionId);

  async function resolveSessionId(): Promise<string> {
    if (sessionIdPromise === null) {
      sessionIdPromise = chatControllerCreateSessionV1({ channel })
        .then((response) => {
          const createdId = parseApiSuccess<ChatSessionEnvelope>(
            response,
            t('errors.sessionFailed'),
          ).data.id;
          onSessionCreated?.(createdId);
          return createdId;
        })
        .catch((error: unknown) => {
          // Clearing the cache lets the next attempt retry instead of
          // rejecting forever from a settled promise.
          sessionIdPromise = null;
          throw error;
        });
    }
    return sessionIdPromise;
  }

  return {
    buildGreeting({ displayName }) {
      return { paragraphs: [t('greeting.intro', { displayName }), t('greeting.scope')] };
    },
    async requestReply(request: ConversationReplyRequest): Promise<AssistantMessageBody> {
      const resolvedSessionId = await resolveSessionId();
      const response = await chatControllerSendMessageV1(resolvedSessionId, {
        content: request.text,
      });
      const envelope = parseApiSuccess<ChatExchangeView>(response, t('errors.replyFailed'));
      return toAssistantMessageBody(
        envelope.data.assistantMessage.content,
        envelope.meta as ChatExchangeMeta | undefined,
      );
    },
  };
}
