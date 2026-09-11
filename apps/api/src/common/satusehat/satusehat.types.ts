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
  };
};

export type SatusehatSearchBundle = {
  readonly total?: unknown;
  readonly entry?: readonly SatusehatSearchBundleEntry[];
};
