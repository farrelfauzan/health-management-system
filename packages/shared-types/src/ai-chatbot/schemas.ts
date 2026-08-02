import { z } from 'zod';

import { calendarDateSchema } from '#appointment-management/schemas';

/**
 * Upstream vendors the multi-provider gateway can route to. Values mirror the
 * Prisma `AiProviderKind` enum; six of the seven speak the OpenAI wire shape
 * and share one adapter, `ANTHROPIC` gets its own (Messages API). `GEMINI`
 * routes through Google's OpenAI-compatibility endpoint rather than the
 * native `generateContent` API, so it needs no adapter of its own.
 */
export const AI_PROVIDER_KINDS = [
  'OPENAI',
  'DEEPSEEK',
  'ANTHROPIC',
  'GEMINI',
  'OLLAMA',
  'OPENAI_COMPATIBLE',
  'AZURE_OPENAI',
] as const;

export const aiProviderKindSchema = z.enum(AI_PROVIDER_KINDS);

export type AiProviderKindValue = z.infer<typeof aiProviderKindSchema>;

/**
 * Which audience a chat session serves. The channel decides the system
 * prompt, the context-enrichment policy, and the safety copy — mirrors the
 * Prisma `ChatChannel` enum.
 */
export const CHAT_CHANNELS = ['PATIENT', 'DOCTOR'] as const;

export const chatChannelSchema = z.enum(CHAT_CHANNELS);

export type ChatChannelValue = z.infer<typeof chatChannelSchema>;

/**
 * Who produced a chat message. SYSTEM covers prompts and policy notices HMS
 * injects itself — mirrors the Prisma `ChatActor` enum.
 */
export const CHAT_ACTORS = ['USER', 'ASSISTANT', 'SYSTEM'] as const;

export const chatActorSchema = z.enum(CHAT_ACTORS);

export type ChatActorValue = z.infer<typeof chatActorSchema>;

/**
 * What the safety guards caught on a turn, persisted in `ChatMessage.safetyTags`
 * so the P13-T11 readiness review and the future analytics dashboard can count
 * them. Tags are additive evidence, not a verdict: a blocked turn and a
 * rewritten one both carry tags, and the message's presence in the transcript
 * says which happened.
 */
export const CHAT_SAFETY_TAGS = [
  'diagnosis_attempt',
  'prescription_attempt',
  'emergency_escalation',
  'prompt_injection',
  'impersonation_attempt',
  'markup_stripped',
  'uncertainty_appended',
] as const;

export const chatSafetyTagSchema = z.enum(CHAT_SAFETY_TAGS);

export type ChatSafetyTagValue = z.infer<typeof chatSafetyTagSchema>;

export const AI_PROVIDER_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/:-]{0,127}$/;

export const AI_CHAT_MESSAGE_MAX_LENGTH = 4000;

export const AI_CHAT_SESSION_PAGE_DEFAULT_LIMIT = 20;

export const AI_CHAT_SESSION_PAGE_MAX_LIMIT = 100;

/**
 * Create payload for a provider configuration. `apiKey` is optional because a
 * self-hosted Ollama host may have no auth; the service enforces the per-kind
 * rule (required for every other kind) since it depends on `providerKind`.
 * `baseUrl` is likewise conditionally required — the resolver rejects an
 * `OPENAI_COMPATIBLE` or `AZURE_OPENAI` config without one, so the API says
 * so at write time rather than at the first patient message. New configs are
 * always staged inactive; activation is its own endpoint.
 */
export const createAiProviderConfigSchema = z.object({
  providerKind: aiProviderKindSchema,
  displayName: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).max(512).optional(),
  baseUrl: z.string().trim().url().max(512).optional(),
  defaultModel: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(AI_PROVIDER_MODEL_PATTERN, 'Model id contains unsupported characters'),
  isEnabled: z.boolean().default(true),
  maxTokens: z.coerce.number().int().min(1).max(32_000).default(2048),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
});

export type CreateAiProviderConfigInput = z.infer<typeof createAiProviderConfigSchema>;

/**
 * Update payload. Every field is optional: an omitted `apiKey` keeps the
 * stored ciphertext (write-only secrets are never echoed back for
 * re-submission), and `baseUrl: null` clears the override back to the vendor
 * default. `providerKind` is absent on purpose — changing the vendor of a
 * config invalidates its key and model together, so that is a new config.
 */
export const updateAiProviderConfigSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    apiKey: z.string().trim().min(1).max(512).optional(),
    baseUrl: z.string().trim().url().max(512).nullable().optional(),
    defaultModel: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(AI_PROVIDER_MODEL_PATTERN, 'Model id contains unsupported characters')
      .optional(),
    isEnabled: z.boolean().optional(),
    maxTokens: z.coerce.number().int().min(1).max(32_000).optional(),
    timeoutMs: z.coerce.number().int().min(1_000).max(120_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateAiProviderConfigInput = z.infer<typeof updateAiProviderConfigSchema>;

export const createChatSessionSchema = z.object({
  channel: chatChannelSchema.default('PATIENT'),
  title: z.string().trim().min(1).max(200).optional(),
});

export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;

/**
 * One user turn. The length cap is the §3.2 input guard, enforced at the
 * schema so an oversized prompt is rejected before it can reach a provider
 * and cost the clinic tokens.
 */
export const sendChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(AI_CHAT_MESSAGE_MAX_LENGTH),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const listChatSessionsQuerySchema = z.object({
  channel: chatChannelSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AI_CHAT_SESSION_PAGE_MAX_LIMIT)
    .default(AI_CHAT_SESSION_PAGE_DEFAULT_LIMIT),
});

export type ListChatSessionsQueryInput = z.infer<typeof listChatSessionsQuerySchema>;

export const listChatMessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AI_CHAT_SESSION_PAGE_MAX_LIMIT)
    .default(AI_CHAT_SESSION_PAGE_DEFAULT_LIMIT),
});

export type ListChatMessagesQueryInput = z.infer<typeof listChatMessagesQuerySchema>;

/**
 * The doctor-channel tool catalogue (Phase 15 tool track). Names are the
 * wire-visible identifiers a provider's `tools` array will carry; the
 * argument schemas beside them are the same objects the dispatch loop
 * validates a model's tool call against — one definition, so what the model
 * is told and what is enforced on return cannot drift
 * (ai-chatbot-tools.md §4.2). A hallucinated argument fails Zod validation
 * here, never inside a repository.
 */
export const AI_CHAT_TOOL_NAMES = [
  'list_my_patients',
  'get_patient_summary',
  'list_my_appointments',
  'check_medication_stock',
  'check_medication_expiry',
] as const;

export const chatToolNameSchema = z.enum(AI_CHAT_TOOL_NAMES);

export type ChatToolNameValue = z.infer<typeof chatToolNameSchema>;

/**
 * What a tool declares as its argument contract. Exported so the API's tool
 * interface can type the schema without a direct zod dependency — the API
 * only ever consumes zod through this package.
 */
export type ChatToolArgumentSchema = z.ZodType;

/**
 * What a tool declares as its **output** contract — the §4.3 allowlist its
 * result is parsed against before leaving the tool. Generic in the projected
 * shape so the API's projection helper stays typed without importing zod.
 */
export type ChatToolResultSchema<TResult> = z.ZodType<TResult>;

/**
 * §7 minimisation: list tools return at most this many rows per call, so
 * "list my patients" can never become a bulk export. The cap is part of the
 * tool contract, not a tuning knob.
 */
export const AI_CHAT_TOOL_LIST_PAGE_LIMIT = 20;

export const listMyPatientsToolArgsSchema = z.object({
  page: z.number().int().min(1).default(1),
});

export type ListMyPatientsToolArgs = z.infer<typeof listMyPatientsToolArgsSchema>;

export const getPatientSummaryToolArgsSchema = z.object({
  patientId: z.string().uuid(),
});

export type GetPatientSummaryToolArgs = z.infer<typeof getPatientSummaryToolArgsSchema>;

/** An omitted date means "today" resolved in the clinic timezone, server-side. */
export const listMyAppointmentsToolArgsSchema = z.object({
  date: calendarDateSchema.optional(),
});

export type ListMyAppointmentsToolArgs = z.infer<typeof listMyAppointmentsToolArgsSchema>;

/** An omitted name means the whole inventory summary, capped like every list. */
export const checkMedicationStockToolArgsSchema = z.object({
  medicationName: z.string().trim().min(1).max(120).optional(),
});

export type CheckMedicationStockToolArgs = z.infer<typeof checkMedicationStockToolArgsSchema>;

export const AI_CHAT_TOOL_EXPIRY_MAX_DAYS = 365;

export const AI_CHAT_TOOL_EXPIRY_DEFAULT_DAYS = 30;

export const checkMedicationExpiryToolArgsSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(AI_CHAT_TOOL_EXPIRY_MAX_DAYS)
    .default(AI_CHAT_TOOL_EXPIRY_DEFAULT_DAYS),
});

export type CheckMedicationExpiryToolArgs = z.infer<typeof checkMedicationExpiryToolArgsSchema>;

/**
 * The per-tool **output allowlist** (ai-chatbot-tools.md §4.3). A tool builds
 * this object field by field from its backing service's response and parses
 * it before the result leaves the tool, so a field nobody listed here cannot
 * appear: a future edit adding an identifier to a domain projection cannot
 * leak, because the tool never copies it. This is an allowlist rather than
 * `redactChatContext`'s denylist on purpose — a denylist fails open on what
 * it did not anticipate, this fails closed.
 *
 * In Mode A (§4.5) these schemas are also the **API contract the web client
 * renders against**, not an internal projection, which is why they live here
 * beside the argument schemas and not inside the API.
 */
export const chatToolMedicationStockItemSchema = z.object({
  medicationCode: z.string(),
  medicationName: z.string(),
  form: z.string().optional(),
  strength: z.string().optional(),
  unit: z.string().optional(),
  stockQty: z.number(),
  reorderLevel: z.number(),
  needsReorder: z.boolean(),
});

export type ChatToolMedicationStockItem = z.infer<typeof chatToolMedicationStockItemSchema>;

/**
 * `matchCount` is how many medications matched, `items` at most
 * {@link AI_CHAT_TOOL_LIST_PAGE_LIMIT} of them — the two differ when a search
 * is broad, and the client must be able to say "20 of 44" rather than imply
 * the list is complete.
 */
export const checkMedicationStockToolResultSchema = z.object({
  medicationName: z.string().nullable(),
  matchCount: z.number(),
  items: z.array(chatToolMedicationStockItemSchema),
});

export type CheckMedicationStockToolResult = z.infer<typeof checkMedicationStockToolResultSchema>;

export const CHAT_TOOL_EXPIRY_STATUSES = ['EXPIRED', 'EXPIRING', 'UNKNOWN'] as const;

export const chatToolExpiryStatusSchema = z.enum(CHAT_TOOL_EXPIRY_STATUSES);

export type ChatToolExpiryStatusValue = z.infer<typeof chatToolExpiryStatusSchema>;

/**
 * A batch line of the expiry report. The receipt this is built from also
 * carries `receivedById` (a staff user id), free-text `notes`, and internal
 * row ids — none of them named here, so none of them survive the projection.
 */
export const chatToolMedicationExpiryItemSchema = z.object({
  medicationCode: z.string(),
  medicationName: z.string(),
  batchNumber: z.string(),
  expiryDate: z.string().optional(),
  remainingQty: z.number(),
  expiryStatus: chatToolExpiryStatusSchema,
  daysUntilExpiry: z.number().optional(),
});

export type ChatToolMedicationExpiryItem = z.infer<typeof chatToolMedicationExpiryItemSchema>;

export const checkMedicationExpiryToolResultSchema = z.object({
  asOfDate: z.string(),
  throughDate: z.string(),
  expiredCount: z.number(),
  expiringCount: z.number(),
  unknownExpiryCount: z.number(),
  matchCount: z.number(),
  items: z.array(chatToolMedicationExpiryItemSchema),
});

export type CheckMedicationExpiryToolResult = z.infer<typeof checkMedicationExpiryToolResultSchema>;
