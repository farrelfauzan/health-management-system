export type ClinicalReference = {
  icon: string;
  label: string;
};

export type AssistantMessageBody = {
  paragraphs: string[];
  bullets?: string[];
  references?: ClinicalReference[];
  suggestionNote?: string;
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
