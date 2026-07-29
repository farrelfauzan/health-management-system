export type BpjsPcareRequestCredentials = {
  readonly consId: string;
  readonly secretKey: string;
  readonly userKey: string;
  readonly pcareUsername: string;
  readonly pcarePassword: string;
};

export type BpjsPcareSignedHeaders = {
  readonly 'X-cons-id': string;
  readonly 'X-Timestamp': string;
  readonly 'X-Signature': string;
  readonly 'X-Authorization': string;
  readonly user_key: string;
};

export type BpjsPcareDecryptionContext = {
  readonly consId: string;
  readonly secretKey: string;
  readonly timestamp: string;
};

export type BpjsPcareResponseMetaData = {
  readonly code: string | number;
  readonly message: string;
};

export type BpjsPcareResponseEnvelope = {
  readonly metaData: BpjsPcareResponseMetaData;
  readonly response: unknown;
};

export type BpjsPcareCodecErrorCode =
  'BPJS_PCARE_RESPONSE_MALFORMED' | 'BPJS_PCARE_DECRYPT_FAILED' | 'BPJS_PCARE_DECOMPRESS_FAILED';

export type BpjsPcareErrorCode =
  | 'BPJS_PCARE_NOT_CONFIGURED'
  | 'BPJS_PCARE_UNAUTHORIZED'
  | 'BPJS_PCARE_TIMEOUT'
  | 'BPJS_PCARE_UNAVAILABLE'
  | 'BPJS_PCARE_CIRCUIT_OPEN'
  | 'BPJS_PCARE_REQUEST_REJECTED'
  | BpjsPcareCodecErrorCode;

export type BpjsPcareAdapterConfig = {
  readonly developmentBaseUrl: string;
  readonly productionBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly maxRetryAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerOpenDurationMs: number;
  readonly workerEnabled: boolean;
  readonly workerPollIntervalMs: number;
  readonly submissionMaxAttempts: number;
  readonly submissionRetryBaseDelayMs: number;
};

export type BpjsPcareHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * One resolved facility connection: which PCare environment to call and the
 * decrypted credential set to sign with. Assembled by the feature repository
 * (the only layer allowed to decrypt) and handed to the HTTP client per call
 * — unlike SATUSEHAT, credentials live in the database, not the environment.
 */
export type BpjsPcareConnection = {
  readonly environment: 'DEVELOPMENT' | 'PRODUCTION';
  readonly credentials: BpjsPcareRequestCredentials;
};

export type BpjsPcareRequest = {
  readonly method: BpjsPcareHttpMethod;
  readonly path: string;
  readonly body?: unknown;
};

export type BpjsPcareCircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type BpjsPcareCircuitBreakerOptions = {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
  readonly now?: () => number;
};
