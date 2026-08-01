import { z } from 'zod';

export const BPJS_ANTREAN_ENVIRONMENTS = ['DEVELOPMENT', 'PRODUCTION'] as const;

export const bpjsAntreanEnvironmentSchema = z.enum(BPJS_ANTREAN_ENVIRONMENTS);

export type BpjsAntreanEnvironmentValue = z.infer<typeof bpjsAntreanEnvironmentSchema>;

/**
 * Upsert payload for the facility's Antrean Online (Mobile JKN) bridging
 * credentials (P14-T03). Deliberately a separate payload from the PCare one:
 * BPJS issues the Antrean service its own consumer ID, secret key, and user
 * key, and revokes them separately (ADR D-023).
 *
 * Every secret is optional because an update that omits one keeps the stored
 * value — write-only secrets are never echoed back for re-submission; the API
 * enforces that `secretKey` and `userKey` are present when no configuration
 * exists yet. The inbound pair stays optional even on create: it is agreed
 * with BPJS at UAT, long after the outbound credentials are first stored, and
 * the endpoint that consumes it is P14-T04.
 */
export const upsertBpjsAntreanConfigSchema = z.object({
  environment: bpjsAntreanEnvironmentSchema,
  consId: z.string().trim().min(1).max(32),
  kdProviderPpk: z.string().trim().min(1).max(32),
  secretKey: z.string().trim().min(1).max(256).optional(),
  userKey: z.string().trim().min(1).max(256).optional(),
  inboundUsername: z.string().trim().min(1).max(128).optional(),
  inboundPassword: z.string().min(1).max(256).optional(),
  isActive: z.boolean().default(true),
});

export type UpsertBpjsAntreanConfigInput = z.infer<typeof upsertBpjsAntreanConfigSchema>;
