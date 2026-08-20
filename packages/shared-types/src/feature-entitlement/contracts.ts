import type { FeatureKey } from '#feature-entitlement/types';

/**
 * One row of `GET /admin/features`: the catalog definition joined to this
 * deployment's switch state. The catalog half travels with the row so the
 * admin screen needs one call, not a call plus a hardcoded label table.
 */
export type FeatureEntitlementView = {
  key: FeatureKey;
  name: string;
  description: string;
  navHrefs: string[];
  isEnabled: boolean;
  /** Absent when nobody has left a reason. */
  notes?: string;
  /** Absent for a row no operator has touched since the seed created it. */
  updatedById?: string;
  /**
   * Absent when no row exists yet — a catalog key added by a release whose
   * seed has not run. The feature reads as enabled in that state, so the
   * missing timestamp is "never configured", not "never checked".
   */
  updatedAt?: string;
};

/**
 * `GET /features/availability` — what any authenticated client needs to know
 * to stop offering a feature this clinic did not buy.
 *
 * Only the enabled keys, and deliberately nothing else: `notes` names internal
 * commercial reasoning, and `updatedById` names a colleague. Neither belongs
 * in a payload every signed-in patient can fetch.
 */
export type FeatureAvailabilityView = {
  enabledKeys: FeatureKey[];
};
