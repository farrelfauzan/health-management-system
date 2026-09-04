import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChannelGatewayConfig,
  extractPhoneNumberFromJid,
  WAHA_USER_JID_SUFFIX,
  WhatsappPairingSessionView,
  WhatsappSessionHealth,
} from '@hms/shared-types';

import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { SendChannelDocumentRequest, SendChannelTextRequest } from './channel-gateway.types';
import { WhatsappBridgeHttpClient } from './whatsapp-bridge-http.client';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { WhatsappSessionService } from './whatsapp-session.service';

const SEND_TEXT_PATH = '/api/sendText';
const SEND_FILE_PATH = '/api/sendFile';

/** WAHA's own name for a session. One clinic, one session. */
const DEFAULT_SESSION_NAME = 'default';

/**
 * The one WAHA session status that means messages will actually move.
 *
 * Everything else — `STARTING`, `SCAN_QR_CODE`, `FAILED`, `STOPPED` — is a
 * session that accepts API calls and delivers nothing, which is §8.4's silent
 * failure exactly. Matching on the working value rather than listing the
 * broken ones is deliberate: a status WAHA adds in a future release must
 * default to "not healthy", not to "healthy because we did not recognise it".
 */
const WAHA_WORKING_STATUS = 'WORKING';

/**
 * The only status that means the bridge is not running at all.
 *
 * Every other non-working value — `STARTING`, `SCAN_QR_CODE`, `FAILED` — is a
 * *reachable* bridge with no usable pairing, which is the distinction the
 * admin card exists to draw: connected-but-not-logged-in sends somebody for
 * the clinic's phone, while not-connected is usually a container that comes
 * back on its own.
 */
const WAHA_STOPPED_STATUS = 'STOPPED';

/**
 * WAHA adapter (`PCS-T10`, D-CS-01, §2.1).
 *
 * **The fallback that makes D-CS-01 real.** GOWA and WAHA both automate
 * WhatsApp Web over the same unofficial protocol, so a WhatsApp update that
 * breaks one may well not break the other — and the entire value of that hedge
 * is that switching is a configuration change. This class is the proof: it
 * implements the same two ports, the contract suite runs the same fixture
 * conversations through both, and no file outside `infrastructure/` knows
 * which one is bound.
 *
 * Four wire-level differences from GOWA, none of which leaks past this file:
 *
 * - **Auth is `X-Api-Key`**, not HTTP basic.
 * - **Sends name a session**, because WAHA is multi-session by design where
 *   GOWA is multi-device.
 * - **Chat ids end `@c.us`.** The canonical stored form is
 *   `@s.whatsapp.net` (see `toCanonicalWhatsappJid`), so this adapter
 *   translates on the way out — which is what lets a conversation survive a
 *   failover instead of starting again under a new key.
 * - **Health is a status string**, not two booleans, so it is mapped rather
 *   than read.
 */
@Injectable()
export class WahaWhatsappAdapter extends WhatsappGatewayService implements WhatsappSessionService {
  private readonly logger = new Logger(WahaWhatsappAdapter.name);
  private readonly gatewayConfig: ChannelGatewayConfig;
  private readonly http: WhatsappBridgeHttpClient;

  constructor(configService: ConfigService) {
    super();
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
    this.http = new WhatsappBridgeHttpClient(this.logger, this.gatewayConfig.whatsapp);
  }

  async sendText(request: SendChannelTextRequest): Promise<void> {
    this.http.assertConfigured();
    // `requestContact` is dropped for the same reason it is on GOWA: it is a
    // presentation hint (§4.1), WhatsApp has no reply-keyboard equivalent, and
    // §5.1.1 tier 1 means this channel never needs the tier-2 card anyway.
    return this.http.enqueueSend(() =>
      this.http.postJson(SEND_TEXT_PATH, this.buildAuthHeaders(), {
        session: this.sessionName,
        chatId: this.toWireChatId(request.externalChatId),
        text: request.text,
      }),
    );
  }

  async sendDocument(request: SendChannelDocumentRequest): Promise<void> {
    this.http.assertConfigured();
    // WAHA's `sendFile` takes the file inline as base64 (its `BinaryFile`
    // shape) or as a URL for the bridge to fetch. Inline, for the same reason
    // GOWA gets multipart: the bytes never sit behind a URL the bridge holds.
    return this.http.enqueueSend(() =>
      this.http.postJson(SEND_FILE_PATH, this.buildAuthHeaders(), {
        session: this.sessionName,
        chatId: this.toWireChatId(request.externalChatId),
        file: {
          mimetype: request.mimeType,
          filename: request.fileName,
          data: Buffer.from(request.content).toString('base64'),
        },
        ...(request.caption === undefined ? {} : { caption: request.caption }),
      }),
    );
  }

  async readSessionHealth(): Promise<WhatsappSessionHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.http.isConfigured) {
      return {
        kind: 'WAHA',
        isConfigured: false,
        isConnected: false,
        isLoggedIn: false,
        checkedAt,
      };
    }
    try {
      const payload = await this.http.getJson(
        `/api/sessions/${encodeURIComponent(this.sessionName)}`,
        this.buildAuthHeaders(),
      );
      const status = (payload as { status?: unknown }).status;
      const statusText = typeof status === 'string' ? status : '';
      return {
        kind: 'WAHA',
        isConfigured: true,
        // `SCAN_QR_CODE` is a *reachable* bridge with no pairing, which is the
        // distinction the admin card exists to draw: connected but not logged
        // in sends someone for the clinic's phone, while not connected is
        // usually a container that will come back on its own.
        isConnected: statusText !== '' && statusText !== WAHA_STOPPED_STATUS,
        isLoggedIn: statusText === WAHA_WORKING_STATUS,
        checkedAt,
      };
    } catch {
      // Already logged by the client, and re-raising would turn "the bridge is
      // down" into "the status endpoint is broken" on the one screen that
      // exists to tell those apart.
      return { kind: 'WAHA', isConfigured: true, isConnected: false, isLoggedIn: false, checkedAt };
    }
  }

  async startPairing(): Promise<WhatsappPairingSessionView> {
    this.http.assertConfigured();
    const health = await this.readSessionHealth();
    if (health.isLoggedIn) {
      // WAHA serves a QR only while the session is waiting for one, and asking
      // otherwise returns an error an operator would read as "pairing is
      // broken". Saying it plainly is better than relaying that.
      throw new ServiceUnavailableException('The WhatsApp session is already paired');
    }
    // Unlike GOWA, WAHA has no endpoint that *mints* a pairing and returns a
    // link — the QR is served continuously while the session sits in
    // SCAN_QR_CODE. So the link is constructed rather than fetched, and for
    // the same reason as GOWA's it is handed over as a private-network URL
    // rather than proxied: a pairing code grants the session outright.
    return {
      qrLink: this.http.buildUrl(`/api/${encodeURIComponent(this.sessionName)}/auth/qr`),
      // WAHA does not publish a QR lifetime. Null says "unknown" rather than
      // inventing a countdown an operator would trust.
      expiresInSeconds: null,
    };
  }

  /**
   * The canonical stored id back into WAHA's wire form.
   *
   * The one place the `@c.us` / `@s.whatsapp.net` disagreement is allowed to
   * exist. Everything above `infrastructure/` — the conversation key, the
   * transcript, `ChannelPatientLink` — holds the canonical form, so failing
   * over between bridges keeps every live conversation.
   */
  private toWireChatId(externalChatId: string): string {
    return `${extractPhoneNumberFromJid(externalChatId)}${WAHA_USER_JID_SUFFIX}`;
  }

  private get sessionName(): string {
    return this.gatewayConfig.whatsapp.sessionName || DEFAULT_SESSION_NAME;
  }

  /**
   * WAHA authenticates with a single API key.
   *
   * The key is read from the same `WA_GATEWAY_API_KEY` variable §8.5 already
   * named, rather than reusing the basic-auth pair GOWA takes: they are
   * different secrets for different bridges, and one variable holding either
   * would make a failover a find-and-replace inside a value.
   */
  private buildAuthHeaders(): Record<string, string> {
    const apiKey = this.gatewayConfig.whatsapp.apiKey;
    return apiKey === '' ? {} : { 'X-Api-Key': apiKey };
  }
}
