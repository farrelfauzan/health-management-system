import type {
  AiProviderKindValue,
  ChatActorValue,
  ChatChannelValue,
} from '#ai-chatbot/schemas';

/**
 * Admin-facing view of one provider configuration. The API key is write-only:
 * the view carries a presence flag and the four-character hint, never the key
 * itself — a stored key cannot be read back through the API at all.
 */
export type AiProviderConfigView = {
  id: string;
  providerKind: AiProviderKindValue;
  displayName: string;
  hasApiKey: boolean;
  apiKeyHint: string;
  baseUrl: string | null;
  defaultModel: string;
  isActive: boolean;
  isEnabled: boolean;
  maxTokens: number;
  timeoutMs: number;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Outcome of a test-connection call. A failed test is a successful HTTP
 * response — the endpoint reports the upstream outcome instead of erroring,
 * so the settings screen can render "gagal" states with the readable reason.
 */
export type AiProviderConnectionTestResult = {
  isSuccessful: boolean;
  message: string;
  testedAt: string;
};

export type ChatSessionView = {
  id: string;
  channel: ChatChannelValue;
  title: string | null;
  providerKind: AiProviderKindValue;
  createdAt: string;
  updatedAt: string;
};

/**
 * One transcript turn as the client sees it. The provider audit columns are
 * deliberately reduced to what a support conversation needs — the request id
 * to quote and the model that answered; status codes, latency, and raw
 * provider metadata stay server-side.
 */
export type ChatMessageView = {
  id: string;
  actor: ChatActorValue;
  content: string;
  disclaimerShown: boolean;
  safetyTags: string[];
  providerRequestId: string | null;
  providerModel: string | null;
  createdAt: string;
};

/** Cursor page envelope; `nextCursor` is null on the last page. */
export type ChatSessionListView = {
  items: ChatSessionView[];
  nextCursor: string | null;
};

export type ChatMessageListView = {
  items: ChatMessageView[];
  nextCursor: string | null;
};

/**
 * A completed exchange: the persisted user turn and the assistant reply it
 * produced. Both are returned so the client renders the transcript from the
 * server's copy rather than echoing its own optimistic text.
 */
export type ChatExchangeView = {
  userMessage: ChatMessageView;
  assistantMessage: ChatMessageView;
};

/**
 * Envelope `meta` for a send-message response. The disclaimer text rides
 * here (never inside the assistant content) so a client cannot render the
 * reply without it, and the provider identifiers give support a thread to
 * pull without exposing the transcript.
 */
export type ChatExchangeMeta = {
  disclaimer: string;
  providerKind: AiProviderKindValue;
  model: string;
  providerRequestId: string | null;
};
