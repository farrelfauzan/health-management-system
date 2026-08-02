import type { ChatMessageView } from '@hms/shared-types';

import type {
  AssistantConversationMessage,
  ConversationMessage,
} from '#lib/ai-assistant/conversation-types';
import { toAssistantMessageBody } from '#lib/ai-assistant/to-assistant-message-body';
import { toReplayedToolResult } from '#lib/ai-assistant/to-replayed-tool-result';

type ToConversationMessagesInput = {
  turns: ChatMessageView[];
  displayName: string;
  assistantName: string;
  formatSentAt: (isoTimestamp: string) => string;
};

/**
 * Projects a stored transcript onto the thread's message shape.
 *
 * `SYSTEM` turns are never rendered as conversation — they are the record of
 * processing (ai-chatbot.md §5.1) — but the ones carrying a tool lookup are
 * **restored onto the assistant turn they belong to**, because in Mode A that
 * payload is the answer. Without this a reopened consultation shows "Saya cek
 * stok amoxicillin" with nothing beneath it, which reads as a broken
 * assistant rather than a rendered one. Context-enrichment turns fall out on
 * their own: they do not parse as a tool result.
 *
 * Ordering carries the association. The service stamps the assistant turn one
 * millisecond after the user's and each tool turn after that, so a tool turn
 * always trails its own assistant turn and attaching to the most recent one
 * is exact rather than a heuristic.
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
  const messages: ConversationMessage[] = [];
  let lastAssistantMessage: AssistantConversationMessage | null = null;
  for (const turn of turns) {
    if (turn.actor === 'SYSTEM') {
      attachReplayedToolResult(lastAssistantMessage, turn.content);
      continue;
    }
    if (turn.actor === 'USER') {
      lastAssistantMessage = null;
      messages.push({
        id: `turn-${turn.id}`,
        role: 'user',
        authorName: displayName,
        sentAtLabel: formatSentAt(turn.createdAt),
        text: turn.content,
      });
      continue;
    }
    lastAssistantMessage = {
      id: `turn-${turn.id}`,
      role: 'assistant',
      authorName: assistantName,
      sentAtLabel: formatSentAt(turn.createdAt),
      body: toAssistantMessageBody(turn.content),
    };
    messages.push(lastAssistantMessage);
  }
  return messages;
}

function attachReplayedToolResult(
  assistantMessage: AssistantConversationMessage | null,
  content: string,
): void {
  if (assistantMessage === null) {
    return;
  }
  const toolResult = toReplayedToolResult(content);
  if (toolResult === null) {
    return;
  }
  assistantMessage.body.toolResults = [...(assistantMessage.body.toolResults ?? []), toolResult];
}
