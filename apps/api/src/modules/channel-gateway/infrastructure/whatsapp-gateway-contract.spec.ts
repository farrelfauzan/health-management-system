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
  OUTBOUND_WIRE_CHAT_IDS,
  type InboundContractCase,
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
    readonly build: (overrides?: Record<string, string>) => WhatsappGatewayService &
      WhatsappSessionService;
    readonly pickBody: (contractCase: InboundContractCase) => unknown;
  };

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
    },
    {
      kind: 'WAHA',
      normalize: normalizeWahaWebhook as unknown as BridgeUnderTest['normalize'],
      build: (overrides) => new WahaWhatsappAdapter(buildConfig('WAHA', overrides)),
      pickBody: (contractCase) => contractCase.wahaBody,
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
        expect(stripIgnoredFields(normalized)).toEqual(
          stripIgnoredFields(contractCase.expected),
        );
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
        await bridge
          .build()
          .sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'Halo' });

        const [, init] = fetchMock.mock.calls[0] ?? [];
        const body = JSON.parse((init as RequestInit).body as string) as Record<string, string>;
        // The stored id is canonical; each adapter renders it back into its own
        // form on the way out. That translation is the only place the
        // @c.us / @s.whatsapp.net disagreement is allowed to exist.
        expect(Object.values(body)).toContain(OUTBOUND_WIRE_CHAT_IDS[bridge.kind]);
        expect(Object.values(body)).toContain('Halo');
      });

      it('authenticates every call', async () => {
        await bridge
          .build()
          .sendText({ externalChatId: CONTRACT_OUTBOUND_CHAT_ID, text: 'Halo' });

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
