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
