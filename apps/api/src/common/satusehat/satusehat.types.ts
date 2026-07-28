export type SatusehatConfig = {
  readonly isConfigured: boolean;
  readonly fhirBaseUrl: string;
  readonly authBaseUrl: string;
  readonly organizationId?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly requestTimeoutMs: number;
  readonly maxRetryAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerOpenDurationMs: number;
};

export type SatusehatErrorCode =
  | 'SATUSEHAT_NOT_CONFIGURED'
  | 'SATUSEHAT_UNAUTHORIZED'
  | 'SATUSEHAT_TIMEOUT'
  | 'SATUSEHAT_UNAVAILABLE'
  | 'SATUSEHAT_CIRCUIT_OPEN'
  | 'SATUSEHAT_REQUEST_REJECTED';

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
