import { z } from 'zod';

export const BPJS_PCARE_ENVIRONMENTS = ['DEVELOPMENT', 'PRODUCTION'] as const;

export const bpjsPcareEnvironmentSchema = z.enum(BPJS_PCARE_ENVIRONMENTS);

export type BpjsPcareEnvironmentValue = z.infer<typeof bpjsPcareEnvironmentSchema>;

/**
 * Upsert payload for the facility's PCare bridging credentials. The three
 * secrets are optional because an update that omits them keeps the stored
 * values (write-only secrets are never echoed back for re-submission); the
 * API enforces that all three are present when no configuration exists yet.
 */
export const upsertBpjsPcareConfigSchema = z.object({
  environment: bpjsPcareEnvironmentSchema,
  consId: z.string().trim().min(1).max(32),
  kdProviderPpk: z.string().trim().min(1).max(32),
  pcareUsername: z.string().trim().min(1).max(128),
  secretKey: z.string().trim().min(1).max(256).optional(),
  userKey: z.string().trim().min(1).max(256).optional(),
  pcarePassword: z.string().min(1).max(256).optional(),
  isActive: z.boolean().default(true),
});

export type UpsertBpjsPcareConfigInput = z.infer<typeof upsertBpjsPcareConfigSchema>;
