import { Logger, ServiceUnavailableException } from '@nestjs/common';

import { WhatsappGatewayConfig } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';

/** Upper bound on any single call to a bridge. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The behaviour both self-hosted bridges need, minus the parts they disagree
 * about (`PCS-T10`).
 *
 * Extracted when the second adapter arrived rather than guessed at when the
 * first did. What lives here is what turned out to be genuinely identical:
 * the timeout, the never-log-a-body rule, the "an unreachable bridge is a
 * `ServiceUnavailable`, not a stack trace" rule, and — the one with teeth —
 * **send pacing as a promise chain**.
 *
 * That last one is here because it is the ban mitigation (§2.1) and it must
 * behave the same on both bridges. Implemented per-adapter it would be two
 * chances to write a per-call `sleep` instead, which two replies composed
 * concurrently would run in parallel and then fire together — precisely the
 * burst the pacing exists to prevent.
 *
 * What is *not* here is everything the bridges genuinely differ on:
 * authentication headers, paths, request bodies, and how a chat id is spelled
 * on the wire. Pushing those into a shared base with flags would be the
 * version of reuse that makes a third adapter harder rather than easier.
 */
export class WhatsappBridgeHttpClient {
  private sendChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly logger: Logger,
    private readonly gatewayConfig: WhatsappGatewayConfig,
  ) {}

  get isConfigured(): boolean {
    return this.gatewayConfig.baseUrl !== '';
  }

  assertConfigured(): void {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('The WhatsApp channel has no gateway configured');
    }
  }

  /**
   * Queues one outbound send behind every send already queued, then holds the
   * configured gap before releasing the next.
   *
   * The chain is repaired after a failure so one rejected send cannot poison
   * every later reply on the channel; the caller still sees its own rejection.
   */
  async enqueueSend(send: () => Promise<void>): Promise<void> {
    const queued = this.sendChain.then(async () => {
      await send();
      await this.pace();
    });
    this.sendChain = queued.catch(() => undefined);
    return queued;
  }

  async postJson(path: string, headers: Record<string, string>, body: unknown): Promise<void> {
    const response = await this.call(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    this.assertSendAccepted(response);
  }

  /**
   * Posts a multipart form — a file send on a bridge that takes bytes as a
   * form field (`P16-T22`).
   *
   * No `Content-Type` is set here, deliberately: `fetch` derives the multipart
   * boundary from the body it serialises, and a hand-written header would name
   * a boundary the body does not use. The caller's headers carry only
   * authentication and scoping.
   */
  async postMultipart(
    path: string,
    headers: Record<string, string>,
    form: FormData,
  ): Promise<void> {
    const response = await this.call(path, { method: 'POST', headers, body: form });
    this.assertSendAccepted(response);
  }

  async getJson(path: string, headers: Record<string, string>): Promise<unknown> {
    const response = await this.call(path, { method: 'GET', headers });
    if (!response.ok) {
      this.logger.warn(
        buildSafeErrorLog('whatsapp_bridge_request_failed', { path, status: response.status }),
      );
      throw new ServiceUnavailableException('The WhatsApp bridge returned an error');
    }
    return response.json();
  }

  /** Absolute URL for a bridge path, for links handed to an operator. */
  buildUrl(path: string): string {
    return `${this.gatewayConfig.baseUrl}${path}`;
  }

  /**
   * A non-2xx on a send is a rejection the caller must see: the delivery
   * worker keeps its row retryable on exactly this signal, and a send that
   * resolved on a 500 would be a false "delivered".
   */
  private assertSendAccepted(response: Response): void {
    if (response.ok) {
      return;
    }
    // The status is safe to surface; the body is not — a bridge error can
    // quote the message it was asked to send, and on this channel that is a
    // member of the public's text.
    this.logger.warn(buildSafeErrorLog('whatsapp_send_failed', { status: response.status }));
    throw new ServiceUnavailableException('The WhatsApp bridge rejected the message');
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(this.buildUrl(path), { ...init, signal: abortController.signal });
    } catch (caughtError) {
      // The path is a private-network address and safe to log; the cause is
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

  private async pace(): Promise<void> {
    if (this.gatewayConfig.sendPacingMs <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, this.gatewayConfig.sendPacingMs));
  }
}
