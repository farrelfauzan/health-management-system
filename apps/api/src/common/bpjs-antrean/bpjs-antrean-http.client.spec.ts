import { createCipheriv, createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { BpjsProtocolCaptureService } from '../bpjs-gateway/bpjs-protocol-capture.service';
import { Logger } from '@nestjs/common';

import LZString from 'lz-string';

import { BpjsAntreanHttpClient } from './bpjs-antrean-http.client';
import { BpjsAntreanError } from './bpjs-antrean.error';
import { BpjsAntreanConnection } from './bpjs-antrean.types';

/**
 * These tests round-trip the adapter against payloads this file encrypts
 * itself. That proves the client is internally consistent — it signs with a
 * timestamp and decodes with the same one — and nothing about BPJS: no
 * Antrean-service credentials have been issued, so no recorded response
 * exists to pin against. The real fixtures are `P14-T02`'s output
 * (docs/post-mvp/bpjs-antrean-spike.md §3), and they replace these
 * self-round-trips as evidence the moment they exist.
 */
describe('BpjsAntreanHttpClient', () => {
  const inputConnection: BpjsAntreanConnection = {
    environment: 'DEVELOPMENT',
    credentials: {
      consId: '20250001',
      secretKey: '0kSp1keSecretKey',
      userKey: 'b1a2c3d4e5f60718293a4b5c6d7e8f90',
    },
  };
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function buildClient(env: Record<string, string> = {}): BpjsAntreanHttpClient {
    return new BpjsAntreanHttpClient(
      new ConfigService({ BPJS_ANTREAN_RETRY_BASE_DELAY_MS: '1', ...env }),
      // The UAT capture instrument (P14-T06), disabled — these cases assert
      // the wire protocol, and a capture sink writing to disk is neither part
      // of it nor allowed to affect it.
      new BpjsProtocolCaptureService(new ConfigService({})),
    );
  }

  function encryptForTimestamp(timestamp: string, payload: unknown): string {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    const hash = createHash('sha256')
      .update(
        `${inputConnection.credentials.consId}${inputConnection.credentials.secretKey}${timestamp}`,
      )
      .digest();
    const cipher = createCipheriv('aes-256-cbc', hash, hash.subarray(0, 16));
    return Buffer.concat([cipher.update(compressed, 'utf8'), cipher.final()]).toString('base64');
  }

  function respondWithEncryptedPayload(
    payload: unknown,
  ): (url: string, init: RequestInit) => Response {
    return (_url: string, init: RequestInit): Response => {
      const headers = init.headers as Record<string, string>;
      const timestamp = headers['X-Timestamp'] ?? '';
      const body = JSON.stringify({
        metaData: { code: '200', message: 'OK' },
        response: encryptForTimestamp(timestamp, payload),
      });
      return new Response(body, { status: 200 });
    };
  }

  it('signs without X-Authorization, decodes with the sent timestamp, and returns the envelope', async () => {
    const expectedPayload = { list: [{ kodepoli: 'ANA', namapoli: 'ANAK' }] };
    fetchMock.mockImplementation(respondWithEncryptedPayload(expectedPayload));
    const client = buildClient();

    const actualEnvelope = await client.sendRequest(inputConnection, {
      method: 'GET',
      path: 'ref/poli',
    });

    expect(actualEnvelope.response).toEqual(expectedPayload);
    const [actualUrl, actualInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe('https://apijkn-dev.bpjs-kesehatan.go.id/antreanfktp_dev/ref/poli');
    const actualHeaders = actualInit.headers as Record<string, string>;
    expect(actualHeaders['X-cons-id']).toBe('20250001');
    expect(actualHeaders['X-Signature']).toBeDefined();
    expect(actualHeaders.user_key).toBe(inputConnection.credentials.userKey);
    expect(actualHeaders['X-Authorization']).toBeUndefined();
  });

  it('routes PRODUCTION connections to the production base URL', async () => {
    fetchMock.mockImplementation(respondWithEncryptedPayload({ ok: true }));
    const client = buildClient();

    await client.sendRequest(
      { ...inputConnection, environment: 'PRODUCTION' },
      { method: 'GET', path: 'ref/poli' },
    );

    const [actualUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe('https://apijkn.bpjs-kesehatan.go.id/antreanfktp/ref/poli');
  });

  it('maps a metaData rejection to BPJS_ANTREAN_REQUEST_REJECTED with the upstream message', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(
          JSON.stringify({
            metaData: { code: '400', message: 'Kode Poli tidak terdaftar' },
            response: null,
          }),
          { status: 200 },
        ),
    );
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, { method: 'GET', path: 'ref/poli' });

    await expect(actualCall).rejects.toMatchObject({
      code: 'BPJS_ANTREAN_REQUEST_REJECTED',
      message: expect.stringContaining('Kode Poli tidak terdaftar') as string,
    });
  });

  it('retries an idempotent request after an upstream failure', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockImplementationOnce(respondWithEncryptedPayload({ ok: true }));
    const client = buildClient();

    const actualEnvelope = await client.sendRequest(inputConnection, {
      method: 'GET',
      path: 'ref/poli',
    });

    expect(actualEnvelope.response).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warnSpy.mock.calls)).toContain('BPJS_ANTREAN_UNAVAILABLE');
    warnSpy.mockRestore();
  });

  it('never retries a POST, because antrean/add is not idempotent', async () => {
    fetchMock.mockResolvedValue(new Response('bad gateway', { status: 502 }));
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, {
      method: 'POST',
      path: 'antrean/add',
      body: { kodebooking: 'HMS-0001' },
    });

    await expect(actualCall).rejects.toMatchObject({ code: 'BPJS_ANTREAN_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps 401 to BPJS_ANTREAN_UNAUTHORIZED without retrying', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, { method: 'GET', path: 'ref/poli' });

    await expect(actualCall).rejects.toMatchObject({ code: 'BPJS_ANTREAN_UNAUTHORIZED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a timeout-shaped rejection to BPJS_ANTREAN_TIMEOUT', async () => {
    fetchMock.mockRejectedValue({ name: 'TimeoutError' });
    const client = buildClient({ BPJS_ANTREAN_MAX_RETRY_ATTEMPTS: '0' });

    const actualCall = client.sendRequest(inputConnection, { method: 'GET', path: 'ref/poli' });

    await expect(actualCall).rejects.toMatchObject({ code: 'BPJS_ANTREAN_TIMEOUT' });
  });

  it('re-labels a shared-codec failure as an antrean failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ metaData: { code: '200', message: 'OK' }, response: 'not-decryptable' }),
        { status: 200 },
      ),
    );
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, { method: 'GET', path: 'ref/poli' });

    await expect(actualCall).rejects.toBeInstanceOf(BpjsAntreanError);
    await expect(actualCall).rejects.toMatchObject({
      code: expect.stringMatching(/^BPJS_ANTREAN_(DECRYPT_FAILED|DECOMPRESS_FAILED)$/) as string,
    });
  });

  it('opens its own circuit after consecutive transport failures and fails fast', async () => {
    fetchMock.mockResolvedValue(new Response('bad gateway', { status: 502 }));
    const client = buildClient({
      BPJS_ANTREAN_MAX_RETRY_ATTEMPTS: '0',
      BPJS_ANTREAN_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });
    const sendOnce = (): Promise<unknown> =>
      client.sendRequest(inputConnection, { method: 'GET', path: 'ref/poli' });

    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_ANTREAN_UNAVAILABLE' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_ANTREAN_UNAVAILABLE' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_ANTREAN_CIRCUIT_OPEN' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('records a business rejection as breaker success so the circuit stays closed', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(
          JSON.stringify({ metaData: { code: '400', message: 'Data tidak ditemukan' } }),
          {
            status: 200,
          },
        ),
    );
    const client = buildClient({ BPJS_ANTREAN_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2' });
    const sendOnce = (): Promise<unknown> =>
      client.sendRequest(inputConnection, { method: 'GET', path: 'ref/poli' });

    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_ANTREAN_REQUEST_REJECTED' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_ANTREAN_REQUEST_REJECTED' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_ANTREAN_REQUEST_REJECTED' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
