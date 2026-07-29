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

/**
 * The eight PCare reference catalogs (P11-T03). Values mirror the Prisma
 * `BpjsReferenceCatalog` enum; the lowercase slugs below are the URL form.
 */
export const BPJS_REFERENCE_CATALOGS = [
  'POLI',
  'DOKTER',
  'KESADARAN',
  'TINDAKAN',
  'DIAGNOSA',
  'DPHO',
  'SPESIALIS',
  'SARANA',
] as const;

export const bpjsReferenceCatalogSchema = z.enum(BPJS_REFERENCE_CATALOGS);

export type BpjsReferenceCatalogValue = z.infer<typeof bpjsReferenceCatalogSchema>;

/**
 * Catalogs whose PCare endpoints are keyword lookups (no enumeration): they
 * are populated by search-and-cache, not by the bulk sync button.
 */
export const BPJS_KEYWORD_REFERENCE_CATALOGS = ['DIAGNOSA', 'DPHO'] as const;

export const BPJS_REFERENCE_CATALOG_SLUGS = [
  'poli',
  'dokter',
  'kesadaran',
  'tindakan',
  'diagnosa',
  'dpho',
  'spesialis',
  'sarana',
] as const;

export const bpjsReferenceCatalogParamsSchema = z.object({
  catalog: z.enum(BPJS_REFERENCE_CATALOG_SLUGS),
});

export type BpjsReferenceCatalogParamsInput = z.infer<typeof bpjsReferenceCatalogParamsSchema>;

export const searchBpjsReferenceQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchBpjsReferenceQueryInput = z.infer<typeof searchBpjsReferenceQuerySchema>;

/**
 * Live keyword lookup against PCare for the non-enumerable catalogs
 * (DIAGNOSA, DPHO). Minimum two characters — PCare keyword endpoints reject
 * or flood on shorter keywords.
 */
export const searchBpjsReferenceRemoteSchema = z.object({
  query: z.string().trim().min(2).max(120),
});

export type SearchBpjsReferenceRemoteInput = z.infer<typeof searchBpjsReferenceRemoteSchema>;

/**
 * Mapping updates are explicit set-or-clear: null unlinks. Non-null codes
 * must exist in the synced local catalog — the API rejects unknown codes with
 * a readable message instead of storing a value BPJS will bounce later.
 */
export const updateBpjsDoctorMappingSchema = z.object({
  bpjsDoctorCode: z.string().trim().min(1).max(32).nullable(),
});

export type UpdateBpjsDoctorMappingInput = z.infer<typeof updateBpjsDoctorMappingSchema>;

export const updateBpjsPoliMappingSchema = z.object({
  bpjsPoliCode: z.string().trim().min(1).max(32).nullable(),
});

export type UpdateBpjsPoliMappingInput = z.infer<typeof updateBpjsPoliMappingSchema>;

export const updateBpjsDphoMappingSchema = z.object({
  dphoCode: z.string().trim().min(1).max(64).nullable(),
});

export type UpdateBpjsDphoMappingInput = z.infer<typeof updateBpjsDphoMappingSchema>;

/**
 * Definitive eligibility outcomes persisted to the per-day cache (P11-T04).
 * A transient UNREACHABLE state exists only on the response — it is never
 * cached, so the next attempt always retries BPJS.
 */
export const BPJS_ELIGIBILITY_OUTCOMES = ['ACTIVE', 'INACTIVE', 'NOT_FOUND'] as const;

export const bpjsEligibilityOutcomeSchema = z.enum(BPJS_ELIGIBILITY_OUTCOMES);

export type BpjsEligibilityOutcomeValue = z.infer<typeof bpjsEligibilityOutcomeSchema>;

export const BPJS_ELIGIBILITY_RESULT_STATES = [...BPJS_ELIGIBILITY_OUTCOMES, 'UNREACHABLE'] as const;

export type BpjsEligibilityResultState = (typeof BPJS_ELIGIBILITY_RESULT_STATES)[number];

export const BPJS_ELIGIBILITY_IDENTIFIER_TYPES = ['BPJS_NUMBER', 'NIK'] as const;

export const bpjsEligibilityIdentifierTypeSchema = z.enum(BPJS_ELIGIBILITY_IDENTIFIER_TYPES);

export type BpjsEligibilityIdentifierTypeValue = z.infer<
  typeof bpjsEligibilityIdentifierTypeSchema
>;

/**
 * Check request: `force` bypasses the per-day cache after the front desk has
 * corrected patient data and needs a fresh answer.
 */
export const checkBpjsEligibilitySchema = z.object({
  force: z.boolean().default(false),
});

export type CheckBpjsEligibilityInput = z.infer<typeof checkBpjsEligibilitySchema>;
