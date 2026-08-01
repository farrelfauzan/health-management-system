import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BpjsGatewayTransport } from '../bpjs-gateway/bpjs-gateway.transport';
import { BpjsProtocolCaptureService } from '../bpjs-gateway/bpjs-protocol-capture.service';
import {
  BpjsGatewayFailureKind,
  BpjsGatewayResponseEnvelope,
  BpjsGatewayCapturedExchange,} from '../bpjs-gateway/bpjs-gateway.types';
import { BpjsPcareCodecError } from '../bpjs-pcare/bpjs-pcare-codec.error';
import { decodeBpjsPcareResponse } from '../bpjs-pcare/decode-bpjs-pcare-response';
import { BpjsAntreanError } from './bpjs-antrean.error';
import { resolveBpjsAntreanAdapterConfig } from './bpjs-antrean.config';
import {
  BpjsAntreanAdapterConfig,
  BpjsAntreanConnection,
  BpjsAntreanErrorCode,
  BpjsAntreanRequest,
} from './bpjs-antrean.types';
import { buildBpjsAntreanHeaders } from './build-bpjs-antrean-headers';

const SERVICE_LABEL = 'BPJS Antrean';
const RETRYABLE_ERROR_CODES: readonly string[] = [
  'BPJS_ANTREAN_TIMEOUT',
  'BPJS_ANTREAN_UNAVAILABLE',
];

/**
 * Signed HTTP client for the BPJS Antrean Online (Mobile JKN) gateway
 * (P14-T03). Contributes the Antrean base URLs, the four-header signing
 * scheme, and the `BPJS_ANTREAN_*` error vocabulary; the request timeout,
 * retry policy, circuit breaker, and envelope reading come from the shared
 * {@link BpjsGatewayTransport}, which was extracted from the PCare client
 * rather than forked. Credentials arrive per call in
 * {@link BpjsAntreanConnection} — they are per-facility database rows.
 *
 * **Standing of this adapter.** It encodes the P14 evaluation's hypotheses,
 * not confirmed protocol facts: no Antrean-service credentials have been
 * issued, so nothing here has met a live BPJS endpoint. Two hypotheses are
 * load-bearing and are the first things the `P14-T02` spike settles:
 *
 * - **Q7 — the response codec.** {@link decodeBpjsPcareResponse} is imported
 *   unchanged, on the hypothesis that Antrean v2 encrypts and compresses
 *   responses exactly as PCare v3.0 does (ADR D-022). That import *is* the
 *   hypothesis; if the first real `ref/poli` response does not decode with
 *   it, this is the single line that changes.
 * - **Q8 — the header set.** See {@link buildBpjsAntreanHeaders}.
 *
 * The success/rejection reading of `metaData.code` is PCare's too: the shared
 * transport treats 200 and 201 as success and everything else as a rejection.
 * Antrean's own code vocabulary is to be built from observed error envelopes
 * (spike §3), not assumed — until then a legible rejection carrying BPJS's
 * message is the most this adapter can honestly promise.
 */
@Injectable()
export class BpjsAntreanHttpClient {
  private readonly adapterConfig: BpjsAntreanAdapterConfig;
  private readonly transport: BpjsGatewayTransport;

  constructor(
    configService: ConfigService,
    private readonly captureService: BpjsProtocolCaptureService,
  ) {
    this.adapterConfig = resolveBpjsAntreanAdapterConfig(configService);
    this.transport = new BpjsGatewayTransport(
      {
        serviceLabel: SERVICE_LABEL,
        createError: (kind, message, upstreamStatusCode) =>
          new BpjsAntreanError(toAntreanErrorCode(kind), message, upstreamStatusCode),
        isRetryableError: (caughtError) =>
          caughtError instanceof BpjsAntreanError &&
          RETRYABLE_ERROR_CODES.includes(caughtError.code),
        isServiceError: (caughtError) => caughtError instanceof BpjsAntreanError,
        describeFailure: (caughtError) =>
          caughtError instanceof BpjsAntreanError ? caughtError.code : 'an unrecognised failure',
        captureExchange: (exchange) => this.recordExchange(exchange),
      },
      this.adapterConfig,
    );
  }

  /**
   * Hands one exchange to the UAT capture instrument (P14-T06). A no-op
   * unless `BPJS_PROTOCOL_CAPTURE_DIR` is configured, and deliberately not
   * awaited — the call must not wait on a disk write.
   */
  private recordExchange(exchange: BpjsGatewayCapturedExchange): void {
    void this.captureService.record({
      service: 'BPJS Antrean',
      direction: 'OUTBOUND',
      method: exchange.method,
      path: exchange.path,
      statusCode: exchange.statusCode,
      requestHeaders: exchange.requestHeaders,
      requestBody: exchange.requestBody,
      rawResponseBody: exchange.rawResponseBody,
      decodedResponse: exchange.decodedResponse,
      outcome: exchange.outcome,
      failureReason: exchange.failureReason,
    });
  }

  /** Sends one signed request and returns the decoded response envelope. */
  async sendRequest(
    connection: BpjsAntreanConnection,
    request: BpjsAntreanRequest,
  ): Promise<BpjsGatewayResponseEnvelope> {
    return this.transport.sendRequest({
      request,
      baseUrl: this.resolveBaseUrl(connection),
      buildHeaders: (timestampSeconds) =>
        buildBpjsAntreanHeaders({ credentials: connection.credentials, timestampSeconds }),
      decodeEnvelope: ({ rawBody, timestampSeconds, statusCode }) =>
        this.decodeEnvelope(connection, rawBody, timestampSeconds, statusCode),
    });
  }

  private resolveBaseUrl(connection: BpjsAntreanConnection): string {
    return connection.environment === 'PRODUCTION'
      ? this.adapterConfig.productionBaseUrl
      : this.adapterConfig.developmentBaseUrl;
  }

  private decodeEnvelope(
    connection: BpjsAntreanConnection,
    rawBody: string,
    timestampSeconds: number,
    statusCode: number,
  ): BpjsGatewayResponseEnvelope {
    try {
      return decodeBpjsPcareResponse({
        context: {
          consId: connection.credentials.consId,
          secretKey: connection.credentials.secretKey,
          timestamp: String(timestampSeconds),
        },
        rawBody,
      });
    } catch (caughtError) {
      if (caughtError instanceof BpjsPcareCodecError) {
        throw new BpjsAntreanError(
          toAntreanCodecErrorCode(caughtError.code),
          caughtError.message,
          statusCode,
        );
      }
      throw caughtError;
    }
  }
}

/**
 * Maps a transport-level failure kind onto Antrean's own error vocabulary, so
 * an antrean failure reads as an antrean failure wherever it surfaces.
 */
function toAntreanErrorCode(kind: BpjsGatewayFailureKind): BpjsAntreanErrorCode {
  return `BPJS_ANTREAN_${kind}` as BpjsAntreanErrorCode;
}

/**
 * Re-labels a shared-codec failure as an Antrean one. The codec is D-022's
 * and raises `BPJS_PCARE_*` codes because PCare is where it was confirmed;
 * a decode failure on an antrean call is an antrean failure regardless.
 */
function toAntreanCodecErrorCode(pcareCode: string): BpjsAntreanErrorCode {
  return pcareCode.replace('BPJS_PCARE_', 'BPJS_ANTREAN_') as BpjsAntreanErrorCode;
}
