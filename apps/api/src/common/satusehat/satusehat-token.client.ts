import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { mapSatusehatTransportError } from './map-satusehat-transport-error';
import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import { CachedSatusehatToken, SatusehatConfig } from './satusehat.types';

const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 60_000;

/**
 * OAuth2 client-credentials token client for the SATUSEHAT platform gateway.
 * Caches the access token until shortly before expiry, deduplicates
 * concurrent refreshes into a single upstream request, and never logs the
 * client secret or the issued token.
 */
@Injectable()
export class SatusehatTokenClient {
  private readonly logger = new Logger(SatusehatTokenClient.name);
  private readonly satusehatConfig: SatusehatConfig;
  private cachedToken: CachedSatusehatToken | null = null;
  private pendingTokenRequest: Promise<string> | null = null;

  constructor(configService: ConfigService) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  /** Returns a valid access token, reusing the cache or refreshing once. */
  async getAccessToken(): Promise<string> {
    if (!this.satusehatConfig.isConfigured) {
      throw new SatusehatError(
        'SATUSEHAT_NOT_CONFIGURED',
        'SATUSEHAT credentials are not configured for this deployment',
      );
    }
    const cached = this.cachedToken;
    if (cached && cached.expiresAtEpochMs - TOKEN_EXPIRY_SAFETY_WINDOW_MS > Date.now()) {
      return cached.accessToken;
    }
    if (!this.pendingTokenRequest) {
      this.pendingTokenRequest = this.requestAccessToken().finally(() => {
        this.pendingTokenRequest = null;
      });
    }
    return this.pendingTokenRequest;
  }

  /** Drops the cached token so the next call fetches a fresh one (e.g. after an upstream 401). */
  invalidateToken(): void {
    this.cachedToken = null;
  }

  private async requestAccessToken(): Promise<string> {
    const tokenUrl = `${this.satusehatConfig.authBaseUrl}/accesstoken?grant_type=client_credentials`;
    const requestBody = new URLSearchParams({
      client_id: this.satusehatConfig.clientId ?? '',
      client_secret: this.satusehatConfig.clientSecret ?? '',
    });
    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody.toString(),
        signal: AbortSignal.timeout(this.satusehatConfig.requestTimeoutMs),
      });
    } catch (caughtError) {
      throw mapSatusehatTransportError(caughtError);
    }
    if (response.status === 401 || response.status === 403) {
      throw new SatusehatError(
        'SATUSEHAT_UNAUTHORIZED',
        `SATUSEHAT rejected the configured client credentials (HTTP ${response.status})`,
        response.status,
      );
    }
    if (!response.ok) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        `SATUSEHAT token endpoint failed (HTTP ${response.status})`,
        response.status,
      );
    }
    const token = await this.parseTokenResponse(response);
    this.cachedToken = token;
    this.logger.log(
      `Obtained SATUSEHAT access token, valid until ${new Date(token.expiresAtEpochMs).toISOString()}`,
    );
    return token.accessToken;
  }

  private async parseTokenResponse(response: Response): Promise<CachedSatusehatToken> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT token endpoint returned a malformed response body',
      );
    }
    const record = payload as { access_token?: unknown; expires_in?: unknown };
    const accessToken = typeof record.access_token === 'string' ? record.access_token : '';
    const expiresInSeconds = Number(record.expires_in);
    if (accessToken === '' || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT token endpoint returned an unexpected payload shape',
      );
    }
    return {
      accessToken,
      expiresAtEpochMs: Date.now() + expiresInSeconds * 1_000,
    };
  }
}
