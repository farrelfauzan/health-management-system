import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChannelGatewayConfig,
  WhatsappPairingSessionView,
  WhatsappSessionHealth,
} from '@hms/shared-types';

import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { buildDocumentBlob } from './build-document-blob';
import { SendChannelDocumentRequest, SendChannelTextRequest } from './channel-gateway.types';
import { WhatsappBridgeHttpClient } from './whatsapp-bridge-http.client';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { WhatsappSessionService } from './whatsapp-session.service';

const SEND_MESSAGE_PATH = '/send/message';
const SEND_FILE_PATH = '/send/file';

/**
 * The multipart fields GOWA's `POST /send/file` reads, pinned from its own
 * `docs/openapi.yaml` (`P16-T22`) rather than inferred from `/send/image`.
 *
 * Named once here so the adapter spec can assert the exact set: a field the
 * bridge does not read is a file that silently never arrives, and a caption
 * under the wrong key is a document with no explanation attached.
 */
const GOWA_SEND_FILE_FIELDS = {
  phone: 'phone',
  file: 'file',
  caption: 'caption',
} as const;
const DEVICE_STATUS_PATH = '/app/status';
const DEVICE_LOGIN_PATH = '/app/login';

/**
 * GOWA adapter for the WhatsApp channel (`PCS-T09`, D-CS-01, §2.1).
 *
 * The primary bridge. Written against `fetch` rather than a client library,
 * matching `OllamaEmbeddingService`: GOWA's surface here is three REST calls,
 * and a dependency for three calls is a dependency to keep current for three
 * calls.
 *
 * The transport behaviour it shares with WAHA — timeouts, the never-log-a-body
 * rule, and §2.1's send pacing as a promise chain — moved to
 * {@link WhatsappBridgeHttpClient} when the second adapter arrived at
 * `PCS-T10`. What stays here is what GOWA genuinely does differently: HTTP
 * basic auth, device scoping, its paths, and its two-boolean health shape.
 */
@Injectable()
export class GowaWhatsappAdapter extends WhatsappGatewayService implements WhatsappSessionService {
  private readonly logger = new Logger(GowaWhatsappAdapter.name);
  private readonly gatewayConfig: ChannelGatewayConfig;
  private readonly http: WhatsappBridgeHttpClient;

  constructor(configService: ConfigService) {
    super();
    this.gatewayConfig = resolveChannelGatewayConfig(configService);
    this.http = new WhatsappBridgeHttpClient(this.logger, this.gatewayConfig.whatsapp);
  }

  async sendText(request: SendChannelTextRequest): Promise<void> {
    this.http.assertConfigured();
    // `requestContact` is dropped, deliberately and without a warning: it is a
    // presentation hint (§4.1), WhatsApp has no reply-keyboard equivalent, and
    // §5.1.1 tier 1 means this channel never needs the tier-2 card anyway —
    // the sender's own JID is the proof. Degrading to plain text is the
    // designed behaviour, not a gap.
    //
    // The chat id goes out as stored: GOWA's wire form *is* the canonical
    // form (`@s.whatsapp.net`), which is why that value was chosen as
    // canonical — it makes `PCS-T10` a translation on one side only, with no
    // migration of rows written before it.
    return this.http.enqueueSend(() =>
      this.http.postJson(SEND_MESSAGE_PATH, this.buildAuthHeaders(), {
        phone: request.externalChatId,
        message: request.text,
      }),
    );
  }

  async sendDocument(request: SendChannelDocumentRequest): Promise<void> {
    this.http.assertConfigured();
    // Multipart rather than `file_url`: GOWA also accepts a URL to download,
    // but the files this carries live behind signed, short-lived object-store
    // URLs that the bridge container has no business resolving — and a URL a
    // bridge fetches is a URL that ends up in its logs.
    const form = new FormData();
    form.append(GOWA_SEND_FILE_FIELDS.phone, request.externalChatId);
    form.append(GOWA_SEND_FILE_FIELDS.file, buildDocumentBlob(request), request.fileName);
    if (request.caption !== undefined) {
      form.append(GOWA_SEND_FILE_FIELDS.caption, request.caption);
    }
    return this.http.enqueueSend(() =>
      this.http.postMultipart(SEND_FILE_PATH, this.buildAuthHeaders(), form),
    );
  }

  async readSessionHealth(): Promise<WhatsappSessionHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.http.isConfigured) {
      return {
        kind: 'GOWA',
        isConfigured: false,
        isConnected: false,
        isLoggedIn: false,
        checkedAt,
      };
    }
    try {
      const payload = await this.http.getJson(DEVICE_STATUS_PATH, this.buildAuthHeaders());
      const results = (payload as { results?: Record<string, unknown> }).results ?? {};
      return {
        kind: 'GOWA',
        isConfigured: true,
        isConnected: results.is_connected === true,
        isLoggedIn: results.is_logged_in === true,
        checkedAt,
      };
    } catch {
      // Already logged by the client, and re-raising would turn "the bridge is
      // down" into "the status endpoint is broken" on the one screen that
      // exists to tell those apart.
      return { kind: 'GOWA', isConfigured: true, isConnected: false, isLoggedIn: false, checkedAt };
    }
  }

  /**
   * Starts a QR pairing and returns the link to the code (§8.4's re-auth).
   *
   * The QR link is served by the bridge on the private network, so it is
   * handed to the admin as a URL an operator opens from inside that network
   * rather than fetched and re-hosted here — re-hosting would put a live
   * pairing credential in an HMS response, and a pairing code is the one
   * secret that grants the WhatsApp session outright.
   */
  async startPairing(): Promise<WhatsappPairingSessionView> {
    this.http.assertConfigured();
    const payload = await this.http.getJson(DEVICE_LOGIN_PATH, this.buildAuthHeaders());
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
}
