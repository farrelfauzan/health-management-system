import type { ChatCitationView } from '@hms/shared-types';

import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

export type ClinicalReference = {
  icon: string;
  label: string;
};

export type AssistantMessageBody = {
  paragraphs: string[];
  bullets?: string[];
  references?: ClinicalReference[];
  suggestionNote?: string;
  /**
   * The mandatory disclaimer, taken from the send-message response envelope's
   * `meta` (ai-chatbot.md §3.1 rule 3). It rides on the message rather than
   * being hardcoded in the UI so the server owns the wording, and it is
   * per-message so a reply that arrived without one cannot render as though
   * it had been shown.
   */
  disclaimer?: string;
  /**
   * The lookups this turn ran (ai-chatbot-tools.md §4.5). In Mode A the model
   * composes its text *before* the lookups execute and never sees the rows,
   * so the reply above is an announcement and this is the actual answer —
   * rendered from data the assistant could not have influenced.
   */
  toolResults?: ParsedToolResult[];
  /**
   * The documents this reply was allowed to draw on (ai-chatbot-tools.md
   * §5.5), numbered to match the `[n]` markers in the text above.
   *
   * Each carries its own `sourceTier`, and the list is rendered per citation
   * rather than summarised on the message: one answer can be grounded in
   * clinic policy *and* in something the reader uploaded themselves, and those
   * carry different authority. Labelling the message as a whole would average
   * the two and lose exactly the distinction that matters.
   */
  citations?: ChatCitationView[];
};

export type UserConversationMessage = {
  id: string;
  role: 'user';
  authorName: string;
  sentAtLabel: string;
  text: string;
};

export type AssistantConversationMessage = {
  id: string;
  role: 'assistant';
  authorName: string;
  sentAtLabel: string;
  body: AssistantMessageBody;
};

export type ConversationReplyRequest = {
  text: string;
  promptId?: string;
};

/**
 * A send that failed in transport, rendered in the thread rather than only in
 * a toast. It carries the request that failed so retrying re-sends exactly
 * what the user typed — losing someone's question because the network blinked
 * is the part that feels broken.
 *
 * Policy failures (chat switched off) deliberately never become one of these:
 * they are answered by `AssistantUnavailableNotice`, and offering "try again"
 * for a decision the clinic made would be a lie.
 */
export type ErrorConversationMessage = {
  id: string;
  role: 'error';
  request: ConversationReplyRequest;
};

export type ConversationMessage =
  UserConversationMessage | AssistantConversationMessage | ErrorConversationMessage;

export interface ConversationService {
  buildGreeting(input: { displayName: string }): AssistantMessageBody;
  requestReply(request: ConversationReplyRequest): Promise<AssistantMessageBody>;
}
