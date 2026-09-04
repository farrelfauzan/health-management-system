import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InboundChannelMessage, WaGatewayKindValue } from '@hms/shared-types';

import { normalizeGowaWebhook } from '../service/normalize-gowa-webhook';
import { normalizeWahaWebhook } from '../service/normalize-waha-webhook';
import { GowaWhatsappAdapter } from './gowa-whatsapp.adapter';
import { resolveWhatsappAdapter } from './resolve-whatsapp-adapter';
import { WahaWhatsappAdapter } from './waha-whatsapp.adapter';
import {
  CONTRACT_IGNORED_FIELDS,
  CONTRACT_OUTBOUND_CHAT_ID,
  INBOUND_CONTRACT_CASES,
  OUTBOUND_DOCUMENT_CONTRACT_CASE,
  OUTBOUND_DOCUMENT_CONTRACT_CASE_WITHOUT_CAPTION,
  OUTBOUND_WIRE_CHAT_IDS,
  type InboundContractCase,
  type SentDocumentOnWire,
} from './whatsapp-gateway-contract.fixtures';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { WhatsappSessionService } from './whatsapp-session.service';

/**
 * The suite that makes D-CS-01 checkable rather than asserted (`PCS-T10`).
 *
 * The strategy's fallback plan says that if GOWA breaks on a WhatsApp update,
 * moving to WAHA is configuration rather than a redesign. Two adapter files
 * cannot demonstrate that by inspection — they *look* different, because the
 * wire formats are — so the same fixture conversations are driven through
 * **both**, from one table, and the assertions are written against what the
 * conversation layer above them receives.
 *
 * Everything here runs against mocked HTTP, so it runs in CI with no bridge,
 * no container, and no WhatsApp number.
 */
describe('WhatsApp gateway contract', () => {
  type BridgeUnderTest = {
    readonly kind: WaGatewayKindValue;
    readonly normalize: (event: never) => InboundChannelMessage | null;
    readonly build: (
      overrides?: Record<string, string>,
    ) => WhatsappGatewayService & WhatsappSessionService;
    readonly pickBody: (contractCase: InboundContractCase) => unknown;
    /** Decodes what this bridge put on the wire for a document send. */
    readonly readSentDocument: (init: RequestInit) => Promise<SentDocumentOnWire>;
  };

  /**
   * GOWA takes the file as a multipart field, so the wire body is a
   * `FormData` and the file arrives as a `File` carrying its own name and
   * MIME type.
   */
  async function readGowaSentDocument(init: RequestInit): Promise<SentDocumentOnWire> {
    const form = init.body as FormData;
    const file = form.get('file') as File;
    const caption = form.get('caption');
    return {
      wireChatId: String(form.get('phone')),
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      caption: typeof caption === 'string' ? caption : null,
    };
  }

  /** WAHA takes the file inline as base64 JSON. */
  async function readWahaSentDocument(init: RequestInit): Promise<SentDocumentOnWire> {
    const body = JSON.parse(init.body as string) as {
      chatId: string;
      caption?: string;
      file: { mimetype: string; filename: string; data: string };
    };
    return {
      wireChatId: body.chatId,
      fileName: body.file.filename,
      mimeType: body.file.mimetype,
      bytes: new Uint8Array(Buffer.from(body.file.data, 'base64')),
      caption: body.caption ?? null,
    };
  }

  function buildConfig(kind: WaGatewayKindValue, overrides: Record<string, string> = {}) {
    return new ConfigService({
      CS_CHANNEL_ENABLED: 'true',
      WA_GATEWAY_KIND: kind,
      WA_GATEWAY_BASE_URL: 'http://bridge:3000',
      WA_GATEWAY_BASIC_AUTH_USERNAME: 'hms',
      WA_GATEWAY_BASIC_AUTH_PASSWORD: 'secret',
      WA_GATEWAY_API_KEY: 'waha-key',
      WA_GATEWAY_SEND_PACING_MS: '0',
      ...overrides,
    });
  }

  const BRIDGES: readonly BridgeUnderTest[] = [
    {
      kind: 'GOWA',
      normalize: normalizeGowaWebhook as unknown as BridgeUnderTest['normalize'],
      build: (overrides) => new GowaWhatsappAdapter(buildConfig('GOWA', overrides)),
      pickBody: (contractCase) => contractCase.gowaBody,
      readSentDocument: readGowaSentDocument,
    },
    {
      kind: 'WAHA',
      normalize: normalizeWahaWebhook as unknown as BridgeUnderTest['normalize'],
      build: (overrides) => new WahaWhatsappAdapter(buildConfig('WAHA', overrides)),
      pickBody: (contractCase) => contractCase.wahaBody,
      readSentDocument: readWahaSentDocument,
    },
  ];

  /**
   * Drops the fields the two bridges are allowed to disagree on, from both
   * sides of the comparison. Driven off the fixtures' own list so the
   * exemption is declared once, next to the reason for it, rather than
   * re-derived in every assertion.
   */
  function stripIgnoredFields(message: Record<string, unknown>): Record<string, unknown> {
    const comparable = { ...message };
    for (const field of CONTRACT_IGNORED_FIELDS) {
      delete comparable[field];
    }
    return comparable;
  }

  let fetchMock: jest.Mock;

  function buildResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fetchMock = jest.fn().mockResolvedValue(buildResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe.each(BRIDGES)('$kind', (bridge) => {
    describe('inbound', () => {
      it.each(INBOUND_CONTRACT_CASES)('$description', (contractCase) => {
        const actual = bridge.normalize(bridge.pickBody(contractCase) as never);

        if (contractCase.expected === null) {
          expect(actual).toBeNull();
          return;
        }
        expect(actual).not.toBeNull();
        // `senderDisplayName` is excluded on purpose: WAHA's message payload
        // carries no push name, which is a documented fact about the bridge
        // rather than a defect. Asserting parity on it would mean either
        // inventing a name for WAHA or discarding one GOWA supplied.
        const { receivedAt, ...normalized } = actual as InboundChannelMessage;
        expect(stripIgnoredFields(normalized)).toEqual(stripIgnoredFields(contractCase.expected));
        // The two bridges carry the clock differently — RFC 3339 against Unix
        // seconds — so the contract is that both produce a *valid instant*,
        // and each normalizer's own spec pins its parsing.
        expect(Number.isNaN(Date.parse(receivedAt))).toBe(false);
      });

      it('produces one canonical chat id regardless of the bridge’s wire form', () => {
        const [firstCase] = INBOUND_CONTRACT_CASES;
        const actual = bridge.normalize(bridge.pickBody(firstCase!) as never);

        // The property a failover depends on: `(channel, externalChatId)` keys
        // the conversation, its transcript, and every ChannelPatientLink, so a
        // bridge-specific id would orphan all three on a switch.
        expect(actual?.externalChatId).toBe(CONTRACT_OUTBOUND_CHAT_ID);
      });
    });

    describe('outbound', () => {
      it('sends the customer’s text to this bridge’s wire address', async () => {
        await bridge.build().sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'Halo' });

        const [, init] = fetchMock.mock.calls[0] ?? [];
        const body = JSON.parse((init as RequestInit).body as string) as Record<string, string>;
        // The stored id is canonical; each adapter renders it back into its own
        // form on the way out. That translation is the only place the
        // @c.us / @s.whatsapp.net disagreement is allowed to exist.
        expect(Object.values(body)).toContain(OUTBOUND_WIRE_CHAT_IDS[bridge.kind]);
        expect(Object.values(body)).toContain('Halo');
      });

      it('authenticates every call', async () => {
        await bridge.build().sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'Halo' });

        const [, init] = fetchMock.mock.calls[0] ?? [];
        const headers = (init as RequestInit).headers as Record<string, string>;
        // Different schemes — basic against X-Api-Key — but a bridge reachable
        // without credentials can send as the clinic.
        expect(headers.Authorization ?? headers['X-Api-Key']).toBeDefined();
      });

      it('refuses to send when no gateway is configured', async () => {
        await expect(
          bridge
            .build({ WA_GATEWAY_BASE_URL: '' })
            .sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'Halo' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it('turns a rejected send into a service-unavailable without leaking the body', async () => {
        fetchMock.mockResolvedValue(buildResponse({ error: 'quoted message text' }, false, 400));

        await expect(
          bridge.build().sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'Halo' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });

      it('keeps sending after one send fails', async () => {
        fetchMock
          .mockResolvedValueOnce(buildResponse({}, false, 500))
          .mockResolvedValueOnce(buildResponse({}));
        const adapter = bridge.build();

        await expect(
          adapter.sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'one' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);

        // A rejection left on the pacing chain would poison every later reply
        // on the channel — one failed send must not silence the clinic.
        await expect(
          adapter.sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'two' }),
        ).resolves.toBeUndefined();
      });

      it('serialises concurrent sends rather than letting them burst', async () => {
        const order: string[] = [];
        fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
          const body = JSON.parse(init.body as string) as Record<string, string>;
          order.push(body.message ?? body.text ?? '');
          return buildResponse({});
        });
        const adapter = bridge.build();

        await Promise.all([
          adapter.sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'first' }),
          adapter.sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'second' }),
          adapter.sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'third' }),
        ]);

        // §2.1's ban mitigation, and it has to hold on both bridges: replies
        // composed concurrently must leave one at a time.
        expect(order).toEqual(['first', 'second', 'third']);
      });
    });

    describe('outbound document', () => {
      // `P16-T22`: the same invoice, driven through both bridges from one
      // fixture. What the recipient's chat receives must be the same document
      // with the same name, type, bytes and caption — the wire encoding
      // (multipart against base64 JSON) is each adapter's own business.
      it('delivers the same document to this bridge’s wire address', async () => {
        await bridge.build().sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE);

        const [, init] = fetchMock.mock.calls[0] ?? [];
        const actual = await bridge.readSentDocument(init as RequestInit);

        expect(actual).toEqual({
          wireChatId: OUTBOUND_WIRE_CHAT_IDS[bridge.kind],
          fileName: OUTBOUND_DOCUMENT_CONTRACT_CASE.fileName,
          mimeType: OUTBOUND_DOCUMENT_CONTRACT_CASE.mimeType,
          bytes: OUTBOUND_DOCUMENT_CONTRACT_CASE.content,
          caption: OUTBOUND_DOCUMENT_CONTRACT_CASE.caption,
        });
      });

      it('sends no caption at all when none is given', async () => {
        await bridge.build().sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE_WITHOUT_CAPTION);

        const [, init] = fetchMock.mock.calls[0] ?? [];
        const actual = await bridge.readSentDocument(init as RequestInit);
        // An empty string would render as a blank line under the document on
        // some clients; absence is what "no caption" means on both bridges.
        expect(actual.caption).toBeNull();
      });

      it('authenticates the document send', async () => {
        await bridge.build().sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE);

        const [, init] = fetchMock.mock.calls[0] ?? [];
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers.Authorization ?? headers['X-Api-Key']).toBeDefined();
      });

      it('refuses to send a document when no gateway is configured', async () => {
        await expect(
          bridge.build({ WA_GATEWAY_BASE_URL: '' }).sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it('rejects a refused document send rather than reporting success', async () => {
        fetchMock.mockResolvedValue(buildResponse({ error: 'session not connected' }, false, 500));

        // US-E4-01: the delivery worker keeps its row QUEUED and retries on
        // exactly this rejection. A promise that resolved here would be a
        // false "delivered" on a bridge that is disconnected.
        await expect(
          bridge.build().sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });

      it('rejects when the bridge is unreachable', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(
          bridge.build().sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });

      it('queues document sends on the same pacing chain as text', async () => {
        const order: string[] = [];
        fetchMock.mockImplementation(async (url: string) => {
          order.push(url);
          return buildResponse({});
        });
        const adapter = bridge.build();

        await Promise.all([
          adapter.sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'first' }),
          adapter.sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE),
          adapter.sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'third' }),
        ]);

        // One chain, not one per message kind: a document composed alongside
        // two replies must leave between them, not burst past them.
        expect(
          order.map((url) => url.endsWith('/send/file') || url.endsWith('/api/sendFile')),
        ).toEqual([false, true, false]);
      });

      it('holds the configured gap between two document sends', async () => {
        jest.useFakeTimers();
        try {
          const adapter = bridge.build({ WA_GATEWAY_SEND_PACING_MS: '1000' });

          const sends = Promise.all([
            adapter.sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE),
            adapter.sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE),
          ]);
          await jest.advanceTimersByTimeAsync(0);

          // §2.1's ban mitigation applies to files exactly as to text: the
          // second document waits out WA_GATEWAY_SEND_PACING_MS behind the first.
          expect(fetchMock).toHaveBeenCalledTimes(1);
          await jest.advanceTimersByTimeAsync(999);
          expect(fetchMock).toHaveBeenCalledTimes(1);
          await jest.advanceTimersByTimeAsync(1);
          expect(fetchMock).toHaveBeenCalledTimes(2);
          await jest.advanceTimersByTimeAsync(1000);
          await sends;
        } finally {
          jest.useRealTimers();
        }
      });
    });

    describe('session health', () => {
      it('reports an unconfigured gateway without calling out', async () => {
        const actual = await bridge.build({ WA_GATEWAY_BASE_URL: '' }).readSessionHealth();

        expect(actual).toMatchObject({ kind: bridge.kind, isConfigured: false, isLoggedIn: false });
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it('reports an unreachable bridge instead of throwing', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        const actual = await bridge.build().readSessionHealth();

        // §8.4: a status card that errors looks exactly like one nobody
        // loaded, and the whole point of that card is to show something wrong.
        expect(actual).toMatchObject({ isConfigured: true, isConnected: false, isLoggedIn: false });
      });

      it('reports a live session', async () => {
        fetchMock.mockResolvedValue(
          buildResponse(
            bridge.kind === 'GOWA'
              ? { results: { is_connected: true, is_logged_in: true } }
              : { name: 'default', status: 'WORKING' },
          ),
        );

        const actual = await bridge.build().readSessionHealth();

        expect(actual).toMatchObject({ kind: bridge.kind, isLoggedIn: true });
      });

      it('reports a lost pairing as connected-but-not-logged-in', async () => {
        fetchMock.mockResolvedValue(
          buildResponse(
            bridge.kind === 'GOWA'
              ? { results: { is_connected: true, is_logged_in: false } }
              : { name: 'default', status: 'SCAN_QR_CODE' },
          ),
        );

        const actual = await bridge.build().readSessionHealth();

        // The distinction the admin card exists to draw: this one sends
        // somebody for the clinic's phone, a disconnection does not.
        expect(actual.isConnected).toBe(true);
        expect(actual.isLoggedIn).toBe(false);
      });
    });
  });

  describe('WA_GATEWAY_KIND selection', () => {
    function resolveFor(kind: string): WhatsappGatewayService {
      const configService = new ConfigService({ WA_GATEWAY_KIND: kind });
      return resolveWhatsappAdapter(
        configService,
        new GowaWhatsappAdapter(configService),
        new WahaWhatsappAdapter(configService),
      );
    }

    it('binds GOWA by default', () => {
      expect(resolveFor('GOWA')).toBeInstanceOf(GowaWhatsappAdapter);
    });

    it('binds WAHA when the env var says so', () => {
      // The acceptance criterion: switching the variable swaps the gateway,
      // and nothing in `service/`, `customer-service/`, or the web app changes.
      expect(resolveFor('WAHA')).toBeInstanceOf(WahaWhatsappAdapter);
    });

    it('is case-insensitive about the value', () => {
      expect(resolveFor('waha')).toBeInstanceOf(WahaWhatsappAdapter);
    });

    it('falls back to the primary on an unrecognised value', () => {
      // A typo in an optional feature's variable must not stop the API from
      // booting, and D-CS-01 names GOWA as the primary.
      expect(resolveFor('GWOA')).toBeInstanceOf(GowaWhatsappAdapter);
      expect(resolveFor('')).toBeInstanceOf(GowaWhatsappAdapter);
    });
  });
});
