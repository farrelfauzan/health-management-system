export type SatusehatConfig = {
  readonly isConfigured: boolean;
  readonly fhirBaseUrl: string;
  readonly authBaseUrl: string;
  /** KFA dictionary service — product lookups, not FHIR. */
  readonly kfaBaseUrl: string;
  readonly organizationId?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly locationId?: string;
  readonly locationName?: string;
  readonly requestTimeoutMs: number;
  readonly maxRetryAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerOpenDurationMs: number;
  readonly workerEnabled: boolean;
  readonly workerPollIntervalMs: number;
  readonly submissionMaxAttempts: number;
  readonly submissionRetryBaseDelayMs: number;
  /** Lease held on a claimed outbox row, keeping other workers off it. */
  readonly submissionLeaseMs: number;
};

/**
 * One KFA product, reduced to what a clinic chooses between. Infrastructure
 * shape: the adapter maps it to the module contract before it leaves here.
 */
export type SatusehatKfaProduct = {
  readonly kfaCode: string;
  readonly name: string;
  readonly dosageForm: string | null;
  readonly manufacturer: string | null;
  readonly packagingUnit: string | null;
  readonly isActive: boolean;
  /**
   * The template (92-level) code under `product_template.kfa_code` (P25-T04
   * probe), or null when the row carries none.
   */
  readonly templateKfaCode: string | null;
};

/**
 * The product-detail body from `/products?identifier=kfa&code=…`: `result` is
 * the same row shape the search returns, or null for a code KFA does not know.
 */
export type SatusehatKfaProductDetailResponse = {
  readonly result?: SatusehatKfaResponseItem | null;
};

/**
 * The KFA search body, typed as loosely as the service actually answers:
 * `items` arrives as a bare array on some deployments and as `{ data: [...] }`
 * on others, and every field is checked before use.
 */
export type SatusehatKfaSearchResponse = {
  readonly items?: SatusehatKfaResponseItem[] | { readonly data?: SatusehatKfaResponseItem[] };
};

export type SatusehatKfaResponseItem = {
  readonly kfa_code?: unknown;
  readonly name?: unknown;
  readonly active?: unknown;
  readonly manufacturer?: unknown;
  readonly dosage_form?: { readonly name?: unknown };
  readonly uom?: { readonly name?: unknown };
  readonly product_template?: { readonly kfa_code?: unknown } | null;
};

export type SatusehatErrorCode =
  | 'SATUSEHAT_NOT_CONFIGURED'
  | 'SATUSEHAT_UNAUTHORIZED'
  | 'SATUSEHAT_TIMEOUT'
  | 'SATUSEHAT_UNAVAILABLE'
  | 'SATUSEHAT_CIRCUIT_OPEN'
  | 'SATUSEHAT_REQUEST_REJECTED'
  | 'SATUSEHAT_AMBIGUOUS_MATCH';

export type SatusehatHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type SatusehatRequest = {
  readonly method: SatusehatHttpMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  /**
   * Overrides the `application/json` a body is otherwise sent under. Only the
   * EpisodeOfCare close needs it: the gateway refuses a JSON Patch sent as
   * plain JSON with `invalid_headers` (P25-T08).
   */
  readonly contentType?: string;
};

export type SatusehatCircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type SatusehatCircuitBreakerOptions = {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
  readonly now?: () => number;
};

export type CachedSatusehatToken = {
  readonly accessToken: string;
  readonly expiresAtEpochMs: number;
};

export type SatusehatSearchBundleEntry = {
  readonly resource?: {
    readonly id?: unknown;
    /**
     * Read only on the newborn search (P24-T11): a mother's NIK identifies
     * every one of her children, so the birth date and birth order are what
     * tell one from another. `unknown` like `id`, because this is a response
     * the platform shapes, not one we do.
     */
    readonly birthDate?: unknown;
    readonly multipleBirthInteger?: unknown;
  };
};

export type SatusehatSearchBundle = {
  readonly total?: unknown;
  readonly entry?: readonly SatusehatSearchBundleEntry[];
};
