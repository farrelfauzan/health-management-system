import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GowaWhatsappAdapter } from './gowa-whatsapp.adapter';

/**
 * What is true of **GOWA specifically**.
 *
 * Everything both bridges must agree on — send addressing, authentication
 * being present at all, pacing, failure isolation, and the four session-health
 * states — lives in `whatsapp-gateway-contract.spec.ts` and runs against this
 * adapter from there. Repeating it here would be two places to update when the
 * shared behaviour changes, and the contract suite is the one that would still
 * be right.
 */
describe('GowaWhatsappAdapter', () => {
  let fetchMock: jest.Mock;

  function buildAdapter(overrides: Record<string, string> = {}): GowaWhatsappAdapter {
    return new GowaWhatsappAdapter(
      new ConfigService({
        WA_GATEWAY_BASE_URL: 'http://gowa:3000',
        WA_GATEWAY_BASIC_AUTH_USERNAME: 'hms',
        WA_GATEWAY_BASIC_AUTH_PASSWORD: 'secret',
        WA_GATEWAY_DEVICE_ID: '628111000111@s.whatsapp.net',
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

  it('posts to GOWA’s send path with basic auth and the device header', async () => {
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

    // Sending an empty header would be a request to scope to a device named ""
    // rather than a request to let GOWA pick the paired one.
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Device-Id']).toBeUndefined();
  });

  it('returns the bridge’s own QR link rather than re-hosting it', async () => {
    fetchMock.mockResolvedValue(
      buildResponse({ results: { qr_link: 'http://gowa:3000/statics/qr.png', qr_duration: 60 } }),
    );

    const actual = await buildAdapter().startPairing();

    // Re-serving the image would put a live pairing credential — which grants
    // the WhatsApp session outright — into an HMS response and its caches.
    expect(actual).toEqual({ qrLink: 'http://gowa:3000/statics/qr.png', expiresInSeconds: 60 });
  });

  it('fails loudly when the bridge returns no pairing link', async () => {
    fetchMock.mockResolvedValue(buildResponse({ results: {} }));

    // Unlike session health, this is an action somebody took: a button that
    // silently does nothing is worse than one that reports why.
    await expect(buildAdapter().startPairing()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
