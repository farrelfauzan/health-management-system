import { z } from 'zod';

/**
 * Upstream vendors the multi-provider gateway can route to. Values mirror the
 * Prisma `AiProviderKind` enum; four of the six speak the OpenAI wire shape
 * and share one adapter, `ANTHROPIC` gets its own (Messages API).
 */
export const AI_PROVIDER_KINDS = [
  'OPENAI',
  'DEEPSEEK',
  'ANTHROPIC',
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
