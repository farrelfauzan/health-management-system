import type {
  AiProviderKindValue,
  ChatActorValue,
  ChatChannelValue,
  ChatPreferredLanguageValue,
  ChatResponseLengthValue,
} from '#ai-chatbot/schemas';

/**
 * Repository projection of a stored provider configuration. Deliberately
 * carries no ciphertext and no decrypted API key — those stay inside the
 * API's repository/crypto layer; the record exposes only the four-character
 * hint and a presence flag (`hasApiKey` is false for a keyless Ollama host).
 */
export type AiProviderConfigRecord = {
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
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Create payload. The API key is plaintext here because the repository is the
 * encryption boundary (it seals the key before persisting); it is optional
 * because a self-hosted Ollama upstream may have no auth at all — the
 * per-kind requiredness rule lives in the service layer, not here.
 */
export type CreateAiProviderConfigData = {
  providerKind: AiProviderKindValue;
  displayName: string;
  apiKey?: string;
  baseUrl?: string | null;
  defaultModel: string;
  isEnabled?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  createdById?: string | null;
};

/**
 * Update payload. An omitted `apiKey` keeps the stored ciphertext (write-only
 * secrets are never echoed back for re-submission); `baseUrl: null` clears
 * the override back to the vendor default. Activation is deliberately not an
 * update field — it has its own transactional repository operation.
 */
export type UpdateAiProviderConfigData = {
  displayName?: string;
  apiKey?: string;
  baseUrl?: string | null;
  defaultModel?: string;
  isEnabled?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  updatedById?: string | null;
};

/**
 * The redacted context HMS may send to a third-party provider on the patient
 * channel (§5.3). Every field is either the patient's own display name or a
 * summary of their own upcoming visit — no identifiers (NIK, BPJS number,
 * MRN), no clinical notes, and nothing about any other patient. Fields are
 * optional throughout: enrichment degrades to silence rather than failing a
 * conversation.
 */
export type PatientChatContext = {
  displayName?: string;
  nextAppointment?: {
    scheduledAt: string;
    doctorName: string;
    specialty: string;
    status: string;
  };
  activeQueueNumber?: number;
};

/**
 * The redacted doctor-channel context (§5.3). Counts and the clinician's own
 * next slot only — deliberately no patient names or ids, because a doctor
 * channel must not become a bulk export route for the patients assigned to
 * them.
 */
export type DoctorChatContext = {
  displayName?: string;
  todayAppointmentCount?: number;
  nextAppointmentAt?: string;
  assignedPatientCount?: number;
};

export type ChatContextPayload = PatientChatContext | DoctorChatContext;

export type AiProviderConnectionTestOutcome = {
  isSuccessful: boolean;
  message: string;
  testedAt: Date;
};

/**
 * Repository projection of one chat session. `ownerUserId` is the anchor
 * every `:own` RBAC scope filters on; the provider columns are denormalized
 * audit metadata that must survive the config row being rotated away.
 */
export type ChatSessionRecord = {
  id: string;
  ownerUserId: string;
  channel: ChatChannelValue;
  providerKey: string;
  providerKind: AiProviderKindValue;
  providerSessionId: string | null;
  title: string | null;
  /** P15-T13: the rolling summary of turns past the replay window. */
  compactedSummary: string | null;
  /** How many of the session's oldest conversational turns it covers. */
  compactedTurnCount: number;
  compactedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * What one compaction pass wrote. Separate from the session record because
 * the caller needs to know whether anything happened at all — a session
 * short enough to fit the window compacts nothing and pays no provider call.
 */
export type ChatCompactionResult = {
  compactedSummary: string;
  compactedTurnCount: number;
};

export type CreateChatSessionData = {
  ownerUserId: string;
  channel: ChatChannelValue;
  providerKey: string;
  providerKind: AiProviderKindValue;
  title?: string | null;
};

/**
 * Repository projection of one message turn. `safetyTags` is normalized to a
 * string array here — the column is JSON, but every writer stores tags.
 */
export type ChatMessageRecord = {
  id: string;
  sessionId: string;
  authorUserId: string | null;
  actor: ChatActorValue;
  content: string;
  providerKind: AiProviderKindValue | null;
  providerRequestId: string | null;
  providerMessageId: string | null;
  providerModel: string | null;
  providerStatusCode: number | null;
  providerLatencyMs: number | null;
  disclaimerShown: boolean;
  safetyTags: string[];
  createdAt: Date;
};

/**
 * Append payload — the only write shape messages have. There is no update or
 * delete counterpart anywhere: transcripts are append-only by design (PMK
 * 24/2022 retention needs the exact text that was shown). `createdAt` lets
 * the writer stamp turn order explicitly: the column has millisecond
 * precision and the id is a random UUID, so two appends inside the same
 * millisecond would otherwise have no defined order — the orchestration
 * service persists a user turn and its assistant reply as one exchange and
 * must never let them flip.
 */
export type AppendChatMessageData = {
  sessionId: string;
  authorUserId?: string | null;
  actor: ChatActorValue;
  content: string;
  providerKind?: AiProviderKindValue | null;
  providerRequestId?: string | null;
  providerMessageId?: string | null;
  providerModel?: string | null;
  providerStatusCode?: number | null;
  providerLatencyMs?: number | null;
  disclaimerShown?: boolean;
  safetyTags?: string[];
  createdAt?: Date;
};

/**
 * Cursor-paginated session list for one owner. `ownerUserId` is mandatory by
 * type so the `:own` scope cannot be forgotten at a call site; the admin
 * support view uses the separate all-sessions params instead.
 */
export type ListOwnChatSessionsParams = {
  ownerUserId: string;
  channel?: ChatChannelValue;
  cursor?: string;
  limit: number;
};

/** Admin support view params — the `:any` scope, optionally narrowed. */
export type ListAllChatSessionsParams = {
  ownerUserId?: string;
  channel?: ChatChannelValue;
  cursor?: string;
  limit: number;
};

export type ListChatMessagesParams = {
  sessionId: string;
  cursor?: string;
  limit: number;
};

/**
 * One page of a cursor-paginated list. `nextCursor` is null on the last page;
 * passing it back verbatim resumes after the final item of this page.
 */
export type ChatSessionPage = {
  items: ChatSessionRecord[];
  nextCursor: string | null;
};

export type ChatMessagePage = {
  items: ChatMessageRecord[];
  nextCursor: string | null;
};

/**
 * Repository projection of one subject's preferences. Absent row and
 * all-null row are the same thing to every reader, so the repository returns
 * an all-null record rather than making callers branch on existence.
 */
export type ChatPreferencesRecord = {
  preferredLanguage: ChatPreferredLanguageValue | null;
  responseLength: ChatResponseLengthValue | null;
  defaultSpecialtyId: string | null;
  defaultSpecialtyName: string | null;
  updatedAt: Date | null;
};

/**
 * Preference update payload. `undefined` leaves a field alone, `null` clears
 * it — the distinction is what lets a subject erase one preference without
 * erasing the rest.
 */
export type UpdateChatPreferencesData = {
  preferredLanguage?: ChatPreferredLanguageValue | null;
  responseLength?: ChatResponseLengthValue | null;
  defaultSpecialtyId?: string | null;
};
