import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { decryptSatusehatKycMessage } from './decrypt-satusehat-kyc-message';
import { encryptSatusehatKycMessage } from './encrypt-satusehat-kyc-message';
import { mapSatusehatTransportError } from './map-satusehat-transport-error';
import { SatusehatCircuitBreaker } from './satusehat-circuit-breaker';
import { SATUSEHAT_KYC_ARMOUR } from './satusehat-kyc-armour';
import { resolveSatusehatKycConfig } from './satusehat-kyc.config';
import { NIK_PATTERN } from './satusehat-nik-pattern';
import { SatusehatTokenClient } from './satusehat-token.client';
import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import {
  SatusehatConfig,
  SatusehatKycAgent,
  SatusehatKycConfig,
  SatusehatKycResponseEnvelope,
  SatusehatKycStatus,
  SatusehatKycValidationUrl,
} from './satusehat.types';

const GENERATE_URL_PATH = '/generate-url';
const ENCRYPTED_CONTENT_TYPE = 'text/plain';
const SUCCESS_CODE = '200';
const UNAUTHORIZED_CODES: readonly string[] = ['401', '403'];
const RATE_LIMITED_CODE = '429';
const SERVER_ERROR_CODE_PREFIX = '5';
const RETRYABLE_ERROR_CODES: readonly string[] = ['SATUSEHAT_TIMEOUT', 'SATUSEHAT_UNAVAILABLE'];

/**
 * The KYC service (SATUSEHAT Mobile profile verification, P24-T14).
 *
 * A third client beside the FHIR and KFA ones because the service is unlike
 * either: every body is hybrid-encrypted and armoured (FR-KYC-01), and the
 * platform answers **HTTP 200 for failures**, with the real status inside
 * `metadata.code` (P21-T01) — so the FHIR client's status-code mapping
 * cannot be reused. What is reused: the token client, the request timeout,
 * the transport-error mapping and a circuit breaker over transport failures.
 *
 * A request is never retried. `generate-url` is a POST that mints a token on
 * the platform, and replaying one after a timeout that in fact landed would
 * mint a second token nobody holds. The caller sees the timeout instead.
 *
 * Nothing that passes through here is logged: not the operator's NIK, not
 * the token, not the URL (FR-KYC-06). An echoed NIK in a platform error text
 * is masked before it reaches the error message.
 */
@Injectable()
export class SatusehatKycClient {
  private readonly logger = new Logger(SatusehatKycClient.name);
  private readonly satusehatConfig: SatusehatConfig;
  private readonly kycConfig: SatusehatKycConfig;
  private readonly circuitBreaker: SatusehatCircuitBreaker;

  constructor(
    configService: ConfigService,
    private readonly tokenClient: SatusehatTokenClient,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
    this.kycConfig = resolveSatusehatKycConfig(configService);
    this.circuitBreaker = new SatusehatCircuitBreaker({
      failureThreshold: this.satusehatConfig.circuitBreakerFailureThreshold,
      openDurationMs: this.satusehatConfig.circuitBreakerOpenDurationMs,
    });
    if (!this.kycConfig.isEnabled) {
      this.logger.log(`SATUSEHAT KYC is disabled: ${this.kycConfig.disabledReason}`);
    }
  }

  /** Whether KYC can be used on this deployment, and why not when it cannot. */
  getStatus(): SatusehatKycStatus {
    return this.kycConfig.isEnabled
      ? { isEnabled: true, disabledReason: null }
      : { isEnabled: false, disabledReason: this.kycConfig.disabledReason };
  }

  /**
   * `POST /generate-url` (FR-KYC-02): a validation URL the operator opens to
   * verify the patient in front of them. The deployment's own public key
   * travels inside the encrypted request, which is how the platform encrypts
   * its answer for our private key alone.
   */
  async generateValidationUrl(agent: SatusehatKycAgent): Promise<SatusehatKycValidationUrl> {
    if (!this.kycConfig.isEnabled) {
      throw new SatusehatError(
        'SATUSEHAT_KYC_DISABLED',
        `SATUSEHAT KYC is disabled on this deployment (${this.kycConfig.disabledReason})`,
      );
    }
    const plaintext = JSON.stringify({
      agent_name: agent.name,
      agent_nik: agent.nik,
      public_key: this.kycConfig.publicKeyPem,
    });
    const body = encryptSatusehatKycMessage({
      plaintext,
      serverPublicKey: this.kycConfig.serverPublicKey,
    });
    const envelope = await this.postEncrypted(GENERATE_URL_PATH, body, this.kycConfig);
    return this.readValidationUrl(envelope);
  }

  private async postEncrypted(
    path: string,
    body: string,
    kycConfig: Extract<SatusehatKycConfig, { isEnabled: true }>,
  ): Promise<SatusehatKycResponseEnvelope> {
    if (!this.circuitBreaker.canExecute()) {
      throw new SatusehatError(
        'SATUSEHAT_CIRCUIT_OPEN',
        'SATUSEHAT circuit breaker is open after repeated upstream failures',
      );
    }
    try {
      const response = await this.performFetch(path, body);
      const envelope = await this.parseResponse(response, kycConfig);
      this.circuitBreaker.recordSuccess();
      return envelope;
    } catch (caughtError) {
      this.recordOutcome(caughtError);
      throw caughtError;
    }
  }

  private recordOutcome(caughtError: unknown): void {
    if (caughtError instanceof SatusehatError && RETRYABLE_ERROR_CODES.includes(caughtError.code)) {
      this.circuitBreaker.recordFailure();
      return;
    }
    if (caughtError instanceof SatusehatError) {
      this.circuitBreaker.recordSuccess();
    }
  }

  /** One attempt, deliberately: see the class comment on why a POST is never retried. */
  private async performFetch(path: string, body: string): Promise<Response> {
    const accessToken = await this.tokenClient.getAccessToken();
    try {
      return await fetch(`${this.satusehatConfig.kycBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': ENCRYPTED_CONTENT_TYPE,
          Accept: 'text/plain, application/json',
        },
        body,
        signal: AbortSignal.timeout(this.satusehatConfig.requestTimeoutMs),
      });
    } catch (caughtError) {
      throw mapSatusehatTransportError(caughtError);
    }
  }

  /**
   * The HTTP status is checked first for the failures the gateway in front
   * of the service still reports the ordinary way (an expired token, an
   * outage); everything the KYC service itself decides comes back as 200
   * and is read from the body.
   */
  private async parseResponse(
    response: Response,
    kycConfig: Extract<SatusehatKycConfig, { isEnabled: true }>,
  ): Promise<SatusehatKycResponseEnvelope> {
    if (response.status === 401 || response.status === 403) {
      throw new SatusehatError(
        'SATUSEHAT_UNAUTHORIZED',
        `SATUSEHAT rejected the KYC request credentials (HTTP ${response.status})`,
        response.status,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        `SATUSEHAT KYC is unavailable (HTTP ${response.status})`,
        response.status,
      );
    }
    if (!response.ok) {
      throw new SatusehatError(
        'SATUSEHAT_KYC_REJECTED',
        `SATUSEHAT rejected the KYC request (HTTP ${response.status})`,
        response.status,
      );
    }
    const rawBody = await this.readBodyText(response);
    const plaintext = rawBody.trimStart().startsWith(SATUSEHAT_KYC_ARMOUR.BEGIN)
      ? this.decryptBody(rawBody, kycConfig)
      : rawBody;
    const envelope = this.parseEnvelope(plaintext);
    this.assertSuccessCode(envelope);
    return envelope;
  }

  private async readBodyText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT KYC returned an unreadable response body',
        response.status,
      );
    }
  }

  private decryptBody(
    armoured: string,
    kycConfig: Extract<SatusehatKycConfig, { isEnabled: true }>,
  ): string {
    try {
      return decryptSatusehatKycMessage({ armoured, privateKey: kycConfig.privateKey });
    } catch {
      throw new SatusehatError(
        'SATUSEHAT_KYC_REJECTED',
        'SATUSEHAT KYC response could not be decrypted with the configured private key',
      );
    }
  }

  private parseEnvelope(plaintext: string): SatusehatKycResponseEnvelope {
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT KYC returned a malformed response body',
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT KYC returned an unexpected response shape',
      );
    }
    return parsed as SatusehatKycResponseEnvelope;
  }

  /**
   * `metadata.code` is the status (P21-T01). Anything but `"200"` is a
   * failure whatever the transport said; the code decides which typed error,
   * and `data.error` — the only actionable text — travels in the message
   * with any NIK masked.
   */
  private assertSuccessCode(envelope: SatusehatKycResponseEnvelope): void {
    const code = String(envelope.metadata?.code ?? '');
    if (code === SUCCESS_CODE) {
      return;
    }
    const detail = this.describeFailure(envelope);
    if (UNAUTHORIZED_CODES.includes(code)) {
      throw new SatusehatError(
        'SATUSEHAT_UNAUTHORIZED',
        `SATUSEHAT KYC rejected the request credentials (code ${code})${detail}`,
      );
    }
    if (code === RATE_LIMITED_CODE || code.startsWith(SERVER_ERROR_CODE_PREFIX)) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        `SATUSEHAT KYC is unavailable (code ${code})${detail}`,
      );
    }
    throw new SatusehatError(
      'SATUSEHAT_KYC_REJECTED',
      `SATUSEHAT KYC rejected the request (code ${code || 'missing'})${detail}`,
    );
  }

  private describeFailure(envelope: SatusehatKycResponseEnvelope): string {
    const texts = [envelope.data?.error, envelope.metadata?.message].filter(
      (text): text is string => typeof text === 'string' && text.trim() !== '',
    );
    if (texts.length === 0) {
      return '';
    }
    return `: ${[...new Set(texts)].join('; ').replace(NIK_PATTERN, '[NIK]')}`;
  }

  private readValidationUrl(envelope: SatusehatKycResponseEnvelope): SatusehatKycValidationUrl {
    const url = typeof envelope.data?.url === 'string' ? envelope.data.url.trim() : '';
    const token = typeof envelope.data?.token === 'string' ? envelope.data.token.trim() : '';
    if (url === '') {
      throw new SatusehatError(
        'SATUSEHAT_KYC_REJECTED',
        'SATUSEHAT KYC answered success without a validation URL',
      );
    }
    return { url, token };
  }
}
