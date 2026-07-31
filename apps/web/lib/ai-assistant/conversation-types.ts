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

export type ConversationMessage = UserConversationMessage | AssistantConversationMessage;

export type ConversationReplyRequest = {
  text: string;
  promptId?: string;
};

export interface ConversationService {
  buildGreeting(input: { displayName: string }): AssistantMessageBody;
  requestReply(request: ConversationReplyRequest): Promise<AssistantMessageBody>;
}
