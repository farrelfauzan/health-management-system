import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChannelGatewayConfig, WhatsappSessionHealth } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { SendChannelTextRequest } from './channel-gateway.types';
import { WhatsappGatewayService } from './whatsapp-gateway.service';

const SEND_MESSAGE_PATH = '/send/message';
const DEVICE_STATUS_PATH = '/app/status';
const DEVICE_LOGIN_PATH = '/app/login';

/** Upper bound on any single call to the bridge. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * GOWA adapter for the WhatsApp channel (`PCS-T09`, D-CS-01, §2.1).
 *
 * Written against `fetch` rather than a client library, matching
 * `OllamaEmbeddingService`: GOWA's surface here is three REST calls, and a
 * dependency for three calls is a dependency to keep up to date for three
 * calls. The port above it is what makes WAHA (`PCS-T10`) and eventually the
 * official Cloud API drop-in replacements — this class is the only file that
 * knows GOWA's paths exist.
 *
 * **Sends are paced and serialised.** §2.1's risk note names human-like send
 * pacing as one of the mitigations against a banned number, and it is
 * implemented as a promise chain rather than a per-call `sleep`: two replies
 * composed concurrently would each sleep in parallel and then fire together,
 * which is exactly the burst the pacing exists to prevent. Chaining makes the
 * gap hold *between* sends no matter how many callers arrive at once.
 *
 * Configuration is read once at construction and an unconfigured gateway
 * fails on first use rather than at boot — the same call
 * `resolveChannelGatewayConfig` makes throughout, because a clinic not running
 * WhatsApp must still be able to start its API.
 */
@Injectable()
export class GowaWhatsappAdapter extends WhatsappGatewayService {
  private readonly logger = new Logger(GowaWhatsappAdapter.name);
  private readonly gatewayConfig: ChannelGatewayConfig;
  /**
   * The tail of the send queue. Every send appends to it, so sends leave in
   * the order they were requested with the configured gap between them.
   */
  private sendChain: Promise<void> = Promise.resolve();

  constructor(configService: ConfigService) {
    super();
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
  }

  async sendText(request: SendChannelTextRequest): Promise<void> {
    this.assertConfigured();
    // `requestContact` is dropped, deliberately and without a warning: it is a
    // presentation hint (§4.1), WhatsApp has no reply-keyboard equivalent, and
    // §5.1.1 tier 1 means this channel never needs the tier-2 card anyway —
    // the sender's own JID is the proof. Degrading to plain text is the
    // designed behaviour, not a gap.
    const send = this.sendChain.then(async () => {
      await this.postSendMessage(request);
      await this.pace();
    });
    // The chain must survive a failed send, or one rejection would poison
    // every later reply on the channel. The caller still sees the rejection.
    this.sendChain = send.catch(() => undefined);
    return send;
  }

  /**
   * Whether the paired device is connected and logged in (§8.4).
   *
   * Returns a value rather than throwing when the bridge is unreachable: the
   * admin status card's whole job is to show that a session has gone, and a
   * card that errors out looks the same as a card nobody has loaded. An
   * unreachable bridge *is* the alert.
   */
  async readSessionHealth(): Promise<WhatsappSessionHealth> {
    if (!this.isConfigured()) {
      return {
        kind: this.gatewayConfig.whatsapp.kind,
        isConfigured: false,
        isConnected: false,
        isLoggedIn: false,
        checkedAt: new Date().toISOString(),
      };
    }
    try {
      const payload = await this.getJson(DEVICE_STATUS_PATH);
      const results = (payload as { results?: Record<string, unknown> }).results ?? {};
      return {
        kind: this.gatewayConfig.whatsapp.kind,
        isConfigured: true,
        isConnected: results.is_connected === true,
        isLoggedIn: results.is_logged_in === true,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      // Already logged by `getJson`, and re-raising would turn "the bridge is
      // down" into "the status endpoint is broken" on the one screen that
      // exists to tell those apart.
      return {
        kind: this.gatewayConfig.whatsapp.kind,
        isConfigured: true,
        isConnected: false,
        isLoggedIn: false,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Starts a QR pairing and returns the link to the code (§8.4's re-auth).
   *
   * The QR link is served by the bridge on the private network, so it is
   * proxied to the admin as a URL an operator opens from inside that network
   * rather than fetched and re-hosted here — re-hosting would put a live
   * pairing credential in an HMS response, and a pairing code is the one
   * secret that grants the WhatsApp session outright.
   */
  async startPairing(): Promise<{ qrLink: string; expiresInSeconds: number | null }> {
    this.assertConfigured();
    const payload = await this.getJson(DEVICE_LOGIN_PATH);
    const results = (payload as { results?: Record<string, unknown> }).results ?? {};
    const qrLink = typeof results.qr_link === 'string' ? results.qr_link : '';
    if (qrLink === '') {
      throw new ServiceUnavailableException('The WhatsApp bridge returned no pairing link');
    }
    return {
      qrLink,
      expiresInSeconds: typeof results.qr_duration === 'number' ? results.qr_duration : null,
    };
  }

  private async postSendMessage(request: SendChannelTextRequest): Promise<void> {
    const response = await this.callBridge(SEND_MESSAGE_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders(),
      },
      body: JSON.stringify({ phone: request.externalChatId, message: request.text }),
    });
    if (!response.ok) {
      // The status is safe to surface; the body is not — a bridge error can
      // quote the message it was asked to send, and on this channel that is a
      // member of the public's text.
      this.logger.warn(
        buildSafeErrorLog('whatsapp_send_failed', { status: response.status }),
      );
      throw new ServiceUnavailableException('The WhatsApp bridge rejected the message');
    }
  }

  private async getJson(path: string): Promise<unknown> {
    const response = await this.callBridge(path, {
      method: 'GET',
      headers: this.buildAuthHeaders(),
    });
    if (!response.ok) {
      this.logger.warn(
        buildSafeErrorLog('whatsapp_bridge_request_failed', { path, status: response.status }),
      );
      throw new ServiceUnavailableException('The WhatsApp bridge returned an error');
    }
    return response.json();
  }

  private async callBridge(path: string, init: RequestInit): Promise<Response> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${this.gatewayConfig.whatsapp.baseUrl}${path}`, {
        ...init,
        signal: abortController.signal,
      });
    } catch (caughtError) {
      // The URL is a private-network host name and safe to log; the cause is
      // reduced to its name for the same reason every other gateway log is.
      this.logger.error(
        buildSafeErrorLog('whatsapp_bridge_unreachable', {
          path,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      throw new ServiceUnavailableException('The WhatsApp bridge is unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * GOWA's device scoping and its HTTP basic auth.
   *
   * `X-Device-Id` is sent only when configured. A single-account deployment —
   * which is every clinic — has one paired device and GOWA picks it; sending
   * an empty header would be a request to scope to a device named "".
   */
  private buildAuthHeaders(): Record<string, string> {
    const { basicAuthUsername, basicAuthPassword, deviceId } = this.gatewayConfig.whatsapp;
    const credential = Buffer.from(`${basicAuthUsername}:${basicAuthPassword}`, 'utf8').toString(
      'base64',
    );
    return {
      ...(basicAuthUsername === '' ? {} : { Authorization: `Basic ${credential}` }),
      ...(deviceId === '' ? {} : { 'X-Device-Id': deviceId }),
    };
  }

  private async pace(): Promise<void> {
    const pacingMs = this.gatewayConfig.whatsapp.sendPacingMs;
    if (pacingMs <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pacingMs));
  }

  private isConfigured(): boolean {
    return this.gatewayConfig.whatsapp.baseUrl !== '';
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('The WhatsApp channel has no gateway configured');
    }
  }
}
