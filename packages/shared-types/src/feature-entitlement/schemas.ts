import { z } from 'zod';

import { FEATURE_KEYS } from '#feature-entitlement/catalog';

/**
 * A catalog key, validated against `FEATURE_CATALOG` rather than against a
 * shape. A key that merely *looks* right would create an entitlement row that
 * switches nothing, which is worse than a 400 — the operator would believe a
 * feature was off while every endpoint behind it kept answering.
 */
export const featureKeySchema = z.enum(
  FEATURE_KEYS as unknown as [string, ...string[]],
);

/**
 * The admin toggle body. `notes` is nullable so an operator can clear a stale
 * reason ("waiting on BPJS credentials") in the same call that flips the
 * switch back on, and absent so a toggle that has nothing to add leaves the
 * existing note alone.
 */
export const updateFeatureEntitlementSchema = z.object({
  isEnabled: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type FeatureKeyInput = z.infer<typeof featureKeySchema>;
export type UpdateFeatureEntitlementInput = z.infer<typeof updateFeatureEntitlementSchema>;
