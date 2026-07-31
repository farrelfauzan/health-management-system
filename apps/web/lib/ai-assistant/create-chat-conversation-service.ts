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

type CreateChatConversationServiceInput = {
  locale: AppLocale;
  channel?: 'PATIENT' | 'DOCTOR';
};

type ChatSessionEnvelope = { id: string };

/**
 * Splits an assistant reply into the paragraph shape the thread renders.
 * The API returns plain text — deliberately, since anything richer would be
 * markup a provider could smuggle instructions through — so paragraphs are
 * blank-line separated and nothing is parsed as markdown.
 */
function toMessageBody(content: string, meta: ChatExchangeMeta | undefined): AssistantMessageBody {
  return {
    paragraphs: content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0),
    ...(meta?.disclaimer === undefined ? {} : { disclaimer: meta.disclaimer }),
  };
}

/**
 * The real Phase 13 conversation client, replacing the MVP mock behind the
 * same {@link ConversationService} interface the panel was written against.
 *
 * The session is created **lazily on the first message**, not when the panel
 * mounts: opening the assistant screen and typing nothing should not consume
 * a row or count against the clinic's daily session quota. It is cached for
 * the lifetime of the service instance, so a conversation keeps its
 * server-side transcript — and `resetConversation` in the panel builds a new
 * service, which is what starts a genuinely new session.
 *
 * The disclaimer is taken from the response envelope's `meta` and carried on
 * the message body rather than hardcoded in the UI: the server decides the
 * text, and a reply that arrived without one must not silently render as if
 * it had been shown.
 */
export function createChatConversationService({
  locale,
  channel = 'PATIENT',
}: CreateChatConversationServiceInput): ConversationService {
  const t = createAiAssistantTranslator(locale);
  let sessionIdPromise: Promise<string> | null = null;

  async function resolveSessionId(): Promise<string> {
    if (sessionIdPromise === null) {
      sessionIdPromise = chatControllerCreateSessionV1({ channel })
        .then(
          (response) =>
            parseApiSuccess<ChatSessionEnvelope>(response, t('errors.sessionFailed')).data.id,
        )
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
      const sessionId = await resolveSessionId();
      const response = await chatControllerSendMessageV1(sessionId, { content: request.text });
      const envelope = parseApiSuccess<ChatExchangeView>(response, t('errors.replyFailed'));
      return toMessageBody(
        envelope.data.assistantMessage.content,
        envelope.meta as ChatExchangeMeta | undefined,
      );
    },
  };
}
