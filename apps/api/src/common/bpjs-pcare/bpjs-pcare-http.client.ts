import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BpjsGatewayTransport } from '../bpjs-gateway/bpjs-gateway.transport';
import {
  BpjsGatewayFailureKind,
  BpjsGatewayResponseEnvelope,
} from '../bpjs-gateway/bpjs-gateway.types';
import { BpjsPcareCodecError } from './bpjs-pcare-codec.error';
import { BpjsPcareError } from './bpjs-pcare.error';
import { resolveBpjsPcareAdapterConfig } from './bpjs-pcare.config';
import {
  BpjsPcareAdapterConfig,
  BpjsPcareConnection,
  BpjsPcareErrorCode,
  BpjsPcareRequest,
  BpjsPcareResponseEnvelope,
} from './bpjs-pcare.types';
import { buildBpjsPcareHeaders } from './build-bpjs-pcare-headers';
import { decodeBpjsPcareResponse } from './decode-bpjs-pcare-response';

const SERVICE_LABEL = 'BPJS PCare';
const RETRYABLE_ERROR_CODES: readonly string[] = ['BPJS_PCARE_TIMEOUT', 'BPJS_PCARE_UNAVAILABLE'];

/**
 * Signed HTTP client for the BPJS PCare REST v3.0 gateway. Contributes the
 * three things that are PCare's own — the base URLs, the five-header signing
 * scheme, and the `BPJS_PCARE_*` error vocabulary — and delegates the request
 * timeout, retry policy, circuit breaker, and envelope reading to the shared
 * {@link BpjsGatewayTransport}. Credentials arrive per call in
 * {@link BpjsPcareConnection} — they are per-facility database rows, not
 * deployment configuration.
 */
@Injectable()
export class BpjsPcareHttpClient {
  private readonly adapterConfig: BpjsPcareAdapterConfig;
  private readonly transport: BpjsGatewayTransport;

  constructor(configService: ConfigService) {
    this.adapterConfig = resolveBpjsPcareAdapterConfig(configService);
    this.transport = new BpjsGatewayTransport(
      {
        serviceLabel: SERVICE_LABEL,
        createError: (kind, message, upstreamStatusCode) =>
          new BpjsPcareError(toPcareErrorCode(kind), message, upstreamStatusCode),
        isRetryableError: (caughtError) =>
          caughtError instanceof BpjsPcareError && RETRYABLE_ERROR_CODES.includes(caughtError.code),
        isServiceError: (caughtError) => caughtError instanceof BpjsPcareError,
        describeFailure: (caughtError) =>
          caughtError instanceof BpjsPcareError ? caughtError.code : 'an unrecognised failure',
      },
      this.adapterConfig,
    );
  }

  /** Sends one signed request and returns the decoded response envelope. */
  async sendRequest(
    connection: BpjsPcareConnection,
    request: BpjsPcareRequest,
  ): Promise<BpjsPcareResponseEnvelope> {
    return this.transport.sendRequest({
      request,
      baseUrl: this.resolveBaseUrl(connection),
      buildHeaders: (timestampSeconds) =>
        buildBpjsPcareHeaders({ credentials: connection.credentials, timestampSeconds }),
      decodeEnvelope: ({ rawBody, timestampSeconds, statusCode }) =>
        this.decodeEnvelope(connection, rawBody, timestampSeconds, statusCode),
    });
  }

  private resolveBaseUrl(connection: BpjsPcareConnection): string {
    return connection.environment === 'PRODUCTION'
      ? this.adapterConfig.productionBaseUrl
      : this.adapterConfig.developmentBaseUrl;
  }

  private decodeEnvelope(
    connection: BpjsPcareConnection,
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
        throw new BpjsPcareError(caughtError.code, caughtError.message, statusCode);
      }
      throw caughtError;
    }
  }
}

/**
 * Maps a transport-level failure kind onto PCare's own error vocabulary. The
 * `BPJS_PCARE_*` codes are persisted on submission rows and read by the
 * integrations monitor, so they stay stable and service-specific even though
 * the failures they name are generic.
 */
function toPcareErrorCode(kind: BpjsGatewayFailureKind): BpjsPcareErrorCode {
  return `BPJS_PCARE_${kind}` as BpjsPcareErrorCode;
}
