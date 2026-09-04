import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WahaWhatsappAdapter } from './waha-whatsapp.adapter';
import {
  OUTBOUND_DOCUMENT_CONTRACT_CASE,
  OUTBOUND_DOCUMENT_CONTRACT_CASE_WITHOUT_CAPTION,
} from './whatsapp-gateway-contract.fixtures';

/**
 * What is true of **WAHA specifically**.
 *
 * The shared behaviour is asserted against this adapter by
 * `whatsapp-gateway-contract.spec.ts`; what remains here is the wire detail
 * that has no GOWA counterpart — session naming, the API-key header, the
 * status-string mapping, and a pairing endpoint that is constructed rather
 * than minted.
 */
describe('WahaWhatsappAdapter', () => {
  let fetchMock: jest.Mock;

  function buildAdapter(overrides: Record<string, string> = {}): WahaWhatsappAdapter {
    return new WahaWhatsappAdapter(
      new ConfigService({
        WA_GATEWAY_KIND: 'WAHA',
        WA_GATEWAY_BASE_URL: 'http://waha:3000',
        WA_GATEWAY_API_KEY: 'waha-key',
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
    fetchMock = jest.fn().mockResolvedValue(buildResponse({ status: 'WORKING' }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts to WAHA’s send path with the API key and the session name', async () => {
    await buildAdapter().sendText({ externalChatId: '628123456789@s.whatsapp.net', text: 'Halo' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://waha:3000/api/sendText');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      session: 'default',
      // Translated out of the canonical stored form. This is the only place
      // the @c.us / @s.whatsapp.net disagreement is allowed to exist.
      chatId: '628123456789@c.us',
      text: 'Halo',
    });
    expect((init as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'waha-key' });
  });

  it('posts a document to /api/sendFile as inline base64 with the session and wire chat id', async () => {
    await buildAdapter().sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://waha:3000/api/sendFile');
    // WAHA's `MessageFileRequest`: `session`, `chatId`, `file` as its
    // `BinaryFile` shape (`mimetype`, `filename`, base64 `data`), `caption`.
    // Inline rather than `RemoteFile`'s `url`: the bytes never sit behind a
    // link the bridge holds.
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      session: 'default',
      chatId: '628123456789@c.us',
      file: {
        mimetype: 'application/pdf',
        filename: 'INV-2026-000123.pdf',
        data: Buffer.from(OUTBOUND_DOCUMENT_CONTRACT_CASE.content).toString('base64'),
      },
      caption: OUTBOUND_DOCUMENT_CONTRACT_CASE.caption,
    });
    expect((init as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'waha-key' });
  });

  it('omits the caption key entirely when none is given', async () => {
    await buildAdapter().sendDocument(OUTBOUND_DOCUMENT_CONTRACT_CASE_WITHOUT_CAPTION);

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('caption');
  });

  it('honours a configured session name', async () => {
    await buildAdapter({ WA_GATEWAY_SESSION_NAME: 'klinik-utama' }).sendText({
      externalChatId: '628123456789@s.whatsapp.net',
      text: 'Halo',
    });

    // WAHA is multi-session by design where GOWA is multi-device, so a shared
    // WAHA host can serve more than one clinic.
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.session).toBe('klinik-utama');
  });

  it.each([
    ['STARTING', true, false],
    ['SCAN_QR_CODE', true, false],
    ['FAILED', true, false],
    ['STOPPED', false, false],
    ['WORKING', true, true],
  ])('maps status %s to connected=%s loggedIn=%s', async (status, isConnected, isLoggedIn) => {
    fetchMock.mockResolvedValue(buildResponse({ name: 'default', status }));

    const actual = await buildAdapter().readSessionHealth();

    expect(actual).toMatchObject({ kind: 'WAHA', isConnected, isLoggedIn });
  });

  it('treats an unrecognised status as not logged in', async () => {
    fetchMock.mockResolvedValue(buildResponse({ name: 'default', status: 'SOMETHING_NEW' }));

    const actual = await buildAdapter().readSessionHealth();

    // Matching on the working value rather than listing the broken ones: a
    // status WAHA adds in a future release must default to "not healthy", not
    // to "healthy because we did not recognise it".
    expect(actual.isLoggedIn).toBe(false);
  });

  it('builds the QR link against the configured session', async () => {
    fetchMock.mockResolvedValue(buildResponse({ name: 'default', status: 'SCAN_QR_CODE' }));

    const actual = await buildAdapter().startPairing();

    // WAHA has no endpoint that mints a pairing — the QR is served
    // continuously while the session waits — so the link is constructed, and
    // like GOWA's it is handed over as a private-network URL rather than
    // proxied: a pairing code grants the session outright.
    expect(actual).toEqual({
      qrLink: 'http://waha:3000/api/default/auth/qr',
      // WAHA publishes no QR lifetime, and inventing a countdown an operator
      // would trust is worse than saying "unknown".
      expiresInSeconds: null,
    });
  });

  it('refuses to start a pairing for a session that is already paired', async () => {
    fetchMock.mockResolvedValue(buildResponse({ name: 'default', status: 'WORKING' }));

    // WAHA serves a QR only while waiting for one; relaying its error would
    // read to an operator as "pairing is broken".
    await expect(buildAdapter().startPairing()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
