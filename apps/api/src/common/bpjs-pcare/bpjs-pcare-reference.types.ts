import { BpjsReferenceCatalogValue } from '@hms/shared-types';

/**
 * Wire-level shapes for the PCare reference lookups (P11-T03). These stay in
 * the adapter layer: the feature module sees only the normalised
 * code/display entries, never PCare's per-catalog field names.
 */
export type BpjsPcareReferenceEntry = {
  readonly code: string;
  readonly display: string;
  readonly groupCode?: string;
};

export type BpjsPcareReferenceListPage = {
  readonly entries: readonly BpjsPcareReferenceEntry[];
  /** PCare's reported total when present (arrives as string or number); null when the endpoint omits it. */
  readonly totalCount: number | null;
};

/**
 * How one catalog is fetched from PCare. SINGLE endpoints return the whole
 * list in one call; PAGINATED endpoints take `{start}/{limit}` path segments;
 * GROUPED_PAGINATED endpoints additionally iterate a fixed set of group codes
 * (TINDAKAN's kdTkp buckets); KEYWORD endpoints cannot be enumerated and are
 * only reachable through a search term.
 */
export type BpjsPcareReferenceFetchPlan =
  | { readonly kind: 'SINGLE'; readonly path: string }
  | { readonly kind: 'PAGINATED'; readonly buildPath: (start: number, limit: number) => string }
  | {
      readonly kind: 'GROUPED_PAGINATED';
      readonly groups: readonly string[];
      readonly buildPath: (group: string, start: number, limit: number) => string;
    }
  | {
      readonly kind: 'KEYWORD';
      readonly buildPath: (keyword: string, start: number, limit: number) => string;
    };

export type BpjsPcareReferenceCatalogDescriptor = {
  readonly catalog: BpjsReferenceCatalogValue;
  readonly codeField: string;
  readonly displayField: string;
  readonly fetchPlan: BpjsPcareReferenceFetchPlan;
};
