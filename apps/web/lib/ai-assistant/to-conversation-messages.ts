import type { ChatMessageView } from '@hms/shared-types';

import type { ConversationMessage } from '#lib/ai-assistant/conversation-types';
import { toAssistantMessageBody } from '#lib/ai-assistant/to-assistant-message-body';

type ToConversationMessagesInput = {
  turns: ChatMessageView[];
  displayName: string;
  assistantName: string;
  formatSentAt: (isoTimestamp: string) => string;
};

/**
 * Projects a stored transcript onto the thread's message shape.
 *
 * `SYSTEM` turns are dropped rather than rendered: they are the record of
 * processing (ai-chatbot.md §5.1), not conversation, and Phase 15 will put
 * redacted tool payloads in them. Once tool results exist, this is also where
 * `meta.toolResults` has to be restored, or a reopened consultation will show
 * prose where cards used to be.
 *
 * Replayed assistant turns carry no disclaimer text: `ChatMessageView` records
 * only that one *was* shown (`disclaimerShown`), and the wording belongs to
 * the server. Inventing it here would be exactly the "render as if it had been
 * shown" failure the live path is written to avoid — the standing
 * confidential-data notice under the composer covers the screen.
 */
export function toConversationMessages({
  turns,
  displayName,
  assistantName,
  formatSentAt,
}: ToConversationMessagesInput): ConversationMessage[] {
  return turns
    .filter((turn) => turn.actor === 'USER' || turn.actor === 'ASSISTANT')
    .map((turn) =>
      turn.actor === 'USER'
        ? {
            id: `turn-${turn.id}`,
            role: 'user' as const,
            authorName: displayName,
            sentAtLabel: formatSentAt(turn.createdAt),
            text: turn.content,
          }
        : {
            id: `turn-${turn.id}`,
            role: 'assistant' as const,
            authorName: assistantName,
            sentAtLabel: formatSentAt(turn.createdAt),
            body: toAssistantMessageBody(turn.content),
          },
    );
}
