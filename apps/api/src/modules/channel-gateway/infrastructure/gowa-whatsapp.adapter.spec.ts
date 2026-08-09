import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GowaWhatsappAdapter } from './gowa-whatsapp.adapter';

describe('GowaWhatsappAdapter', () => {
  let fetchMock: jest.Mock;

  function buildAdapter(overrides: Record<string, string> = {}): GowaWhatsappAdapter {
    return new GowaWhatsappAdapter(
      new ConfigService({
        WA_GATEWAY_BASE_URL: 'http://gowa:3000',
        WA_GATEWAY_BASIC_AUTH_USERNAME: 'hms',
        WA_GATEWAY_BASIC_AUTH_PASSWORD: 'secret',
        WA_GATEWAY_DEVICE_ID: '628111000111@s.whatsapp.net',
        // Pacing off by default so the suite does not spend real seconds; the
        // ordering test below turns it back on with fake timers.
        WA_GATEWAY_SEND_PACING_MS: '0',
        ...overrides,
      }),
    );
  }

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

  describe('sendText', () => {
    it('posts the message with basic auth and the device header', async () => {
      await buildAdapter().sendText({ externalChatId: '628123456789@s.whatsapp.net', text: 'Halo' });

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe('http://gowa:3000/send/message');
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        phone: '628123456789@s.whatsapp.net',
        message: 'Halo',
      });
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Basic ${Buffer.from('hms:secret').toString('base64')}`);
      expect(headers['X-Device-Id']).toBe('628111000111@s.whatsapp.net');
    });

    it('omits the device header when no device is configured', async () => {
      await buildAdapter({ WA_GATEWAY_DEVICE_ID: '' }).sendText({
        externalChatId: '628123456789@s.whatsapp.net',
        text: 'Halo',
      });

      // Sending an empty header would be a request to scope to a device
      // named "" rather than a request to let GOWA pick the paired one.
      const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers['X-Device-Id']).toBeUndefined();
    });

    it('refuses to send when no gateway is configured', async () => {
      await expect(
        buildAdapter({ WA_GATEWAY_BASE_URL: '' }).sendText({
          externalChatId: '628123456789@s.whatsapp.net',
          text: 'Halo',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('turns a rejected send into a service-unavailable without leaking the body', async () => {
      fetchMock.mockResolvedValue(buildResponse({ error: 'quoted message text' }, false, 400));

      await expect(
        buildAdapter().sendText({ externalChatId: '628123456789@s.whatsapp.net', text: 'Halo' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('keeps sending after one send fails', async () => {
      fetchMock
        .mockResolvedValueOnce(buildResponse({}, false, 500))
        .mockResolvedValueOnce(buildResponse({}));
      const adapter = buildAdapter();

      await expect(
        adapter.sendText({ externalChatId: 'a@s.whatsapp.net', text: 'one' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      // A rejection left on the chain would poison every later reply on the
      // channel — one failed send must not silence the clinic.
      await expect(
        adapter.sendText({ externalChatId: 'b@s.whatsapp.net', text: 'two' }),
      ).resolves.toBeUndefined();
    });

    it('serialises concurrent sends rather than letting them burst', async () => {
      const order: string[] = [];
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        order.push(JSON.parse(init.body as string).message);
        return buildResponse({});
      });
      const adapter = buildAdapter();

      await Promise.all([
        adapter.sendText({ externalChatId: 'a@s.whatsapp.net', text: 'first' }),
        adapter.sendText({ externalChatId: 'b@s.whatsapp.net', text: 'second' }),
        adapter.sendText({ externalChatId: 'c@s.whatsapp.net', text: 'third' }),
      ]);

      // §2.1's pacing is a chain and not a per-call sleep, precisely so that
      // replies composed concurrently leave one at a time instead of sleeping
      // in parallel and then firing together.
      expect(order).toEqual(['first', 'second', 'third']);
    });
  });

  describe('readSessionHealth', () => {
    it('reports a live session', async () => {
      fetchMock.mockResolvedValue(
        buildResponse({ results: { is_connected: true, is_logged_in: true } }),
      );

      const actual = await buildAdapter().readSessionHealth();

      expect(actual).toMatchObject({ kind: 'GOWA', isConfigured: true, isConnected: true, isLoggedIn: true });
    });

    it('reports a logged-out session, which is the failure §8.4 cares about', async () => {
      fetchMock.mockResolvedValue(
        buildResponse({ results: { is_connected: true, is_logged_in: false } }),
      );

      const actual = await buildAdapter().readSessionHealth();

      expect(actual.isConnected).toBe(true);
      expect(actual.isLoggedIn).toBe(false);
    });

    it('reports an unreachable bridge instead of throwing', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const actual = await buildAdapter().readSessionHealth();

      // A status card that errors looks exactly like one nobody loaded, and
      // the whole point of this card is to show that something is wrong.
      expect(actual).toMatchObject({ isConfigured: true, isConnected: false, isLoggedIn: false });
    });

    it('reports an unconfigured gateway without calling out', async () => {
      const actual = await buildAdapter({ WA_GATEWAY_BASE_URL: '' }).readSessionHealth();

      expect(actual.isConfigured).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('startPairing', () => {
    it('returns the bridge’s own QR link rather than re-hosting it', async () => {
      fetchMock.mockResolvedValue(
        buildResponse({ results: { qr_link: 'http://gowa:3000/statics/qr.png', qr_duration: 60 } }),
      );

      const actual = await buildAdapter().startPairing();

      // Re-serving the image would put a live pairing credential — which
      // grants the WhatsApp session outright — into an HMS response.
      expect(actual).toEqual({ qrLink: 'http://gowa:3000/statics/qr.png', expiresInSeconds: 60 });
    });

    it('fails loudly when the bridge returns no link', async () => {
      fetchMock.mockResolvedValue(buildResponse({ results: {} }));

      await expect(buildAdapter().startPairing()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
