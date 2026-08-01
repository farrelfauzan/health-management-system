/**
 * Transport-level types shared by every BPJS API-gateway service HMS speaks
 * to. PCare (P11-T02) and Antrean Online (P14-T03) are separate services with
 * separately issued credentials and different header sets, but they ride the
 * same gateway and therefore the same timeout/retry/circuit-breaker policy
 * and the same response-envelope shape. Nothing service-specific belongs
 * here — no credential shapes, no endpoint paths, no error-code strings.
 */

export type BpjsGatewayHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type BpjsGatewayEnvironment = 'DEVELOPMENT' | 'PRODUCTION';

export type BpjsGatewayRequest = {
  readonly method: BpjsGatewayHttpMethod;
  readonly path: string;
  readonly body?: unknown;
};

export type BpjsGatewayResponseMetaData = {
  readonly code: string | number;
  readonly message: string;
};

export type BpjsGatewayResponseEnvelope = {
  readonly metaData: BpjsGatewayResponseMetaData;
  readonly response: unknown;
};

/**
 * The transport-level failure kinds a service adapter must be able to name.
 * Each service maps these onto its own error-code vocabulary (for example
 * `UNAUTHORIZED` becomes `BPJS_PCARE_UNAUTHORIZED`), so the codes that reach
 * the database and the ops surfaces stay per-service and stable.
 */
export type BpjsGatewayFailureKind =
  'UNAUTHORIZED' | 'UNAVAILABLE' | 'TIMEOUT' | 'CIRCUIT_OPEN' | 'REQUEST_REJECTED';

export type BpjsGatewayResiliencePolicy = {
  readonly requestTimeoutMs: number;
  readonly maxRetryAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerOpenDurationMs: number;
};

/**
 * The service-static half of what {@link BpjsGatewayTransport} cannot know:
 * how to name a failure in this service's own error vocabulary, and how to
 * recognise its own errors coming back. Supplied once at construction.
 */
export type BpjsGatewayServiceProfile = {
  /** Service name used verbatim in error messages and retry log lines. */
  readonly serviceLabel: string;
  readonly createError: (
    kind: BpjsGatewayFailureKind,
    message: string,
    upstreamStatusCode?: number,
  ) => Error;
  /** Whether a thrown error is a transport failure worth retrying. */
  readonly isRetryableError: (caughtError: unknown) => boolean;
  /** Whether a thrown error came from this service's adapter at all. */
  readonly isServiceError: (caughtError: unknown) => boolean;
  /** Short, credential-free description of a failure for the retry log line. */
  readonly describeFailure: (caughtError: unknown) => string;
  /**
   * Optional UAT instrument (P14-T06). When present, the transport hands it
   * every completed exchange — **including rejected ones**, because the
   * failure taxonomy is one of the fixtures `P14-T02` must record from real
   * responses rather than guess. Fire-and-forget by contract: the transport
   * never awaits it and never lets it affect the call.
   */
  readonly captureExchange?: (exchange: BpjsGatewayCapturedExchange) => void;
};

/** One completed request/response exchange, as handed to {@link BpjsGatewayServiceProfile.captureExchange}. */
export type BpjsGatewayCapturedExchange = {
  readonly method: BpjsGatewayHttpMethod;
  readonly path: string;
  readonly statusCode: number;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: unknown;
  readonly rawResponseBody: string;
  readonly decodedResponse: unknown;
  readonly outcome: 'ACCEPTED' | 'REJECTED';
  readonly failureReason?: string;
};

/**
 * The per-call half: where to send this request, how to sign it, and how to
 * decode what comes back. Assembled by the service's HTTP client from the
 * facility connection it was handed, because BPJS credentials are per-facility
 * database rows rather than deployment configuration.
 */
export type BpjsGatewayCall = {
  readonly request: BpjsGatewayRequest;
  readonly baseUrl: string;
  readonly buildHeaders: (timestampSeconds: number) => Record<string, string>;
  readonly decodeEnvelope: (params: {
    readonly rawBody: string;
    readonly timestampSeconds: number;
    readonly statusCode: number;
  }) => BpjsGatewayResponseEnvelope;
};

export type BpjsGatewayCircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type BpjsGatewayCircuitBreakerOptions = {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
  readonly now?: () => number;
};
