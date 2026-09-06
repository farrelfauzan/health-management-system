/**
 * A key in {@link FEATURE_CATALOG}. Deliberately a union of literals rather
 * than `string`: a feature that nothing implements must not be typeable, and
 * the admin API validates an incoming key against this list before it writes.
 */
export type FeatureKey =
  | 'ai-chatbot'
  | 'room-management'
  | 'pharmacy'
  | 'billing'
  | 'bpjs-pcare'
  | 'bpjs-antrean'
  | 'satusehat'
  | 'document-management'
  // P16-T21: the four Phase-16 epics that are sold apart from the documents
  // module itself. E5's registry stays platform-adjacent and ungated; only
  // its approval workflow has a key.
  | 'invoice-documents'
  | 'patient-documents'
  | 'doctor-credentials'
  | 'invoice-delivery'
  | 'document-approval'
  | 'cs-channels';

/**
 * One optional product feature, as both the API and the web app know it.
 *
 * `navHrefs` is here rather than in the frontend because the answer to "what
 * disappears when this is off" has to be the same on both sides: the shell
 * hides these routes, and IMP-8's `FeatureGuard` refuses the endpoints behind
 * them. Two lists would drift into a nav entry that leads to a 403.
 */
export type FeatureCatalogEntry = {
  readonly key: FeatureKey;
  /** Admin-facing label. English; the web app localises by key, not by this. */
  readonly name: string;
  /** One sentence on what the clinic loses when the switch goes off. */
  readonly description: string;
  /**
   * Portal routes this feature owns. Empty only for a feature whose screens
   * do not exist yet — never for one that has screens under another key.
   */
  readonly navHrefs: readonly string[];
};

/** Repository projection of a `feature_entitlements` row. */
export type FeatureEntitlementRecord = {
  id: string;
  featureKey: string;
  isEnabled: boolean;
  notes: string | null;
  updatedById: string | null;
  updatedAt: Date;
};

export type UpdateFeatureEntitlementPayload = {
  featureKey: string;
  isEnabled: boolean;
  notes?: string | null;
  updatedById: string;
};
