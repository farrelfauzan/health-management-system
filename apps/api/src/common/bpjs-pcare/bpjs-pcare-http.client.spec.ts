import { createCipheriv, createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import LZString from 'lz-string';

import { BpjsPcareHttpClient } from './bpjs-pcare-http.client';
import { BpjsPcareError } from './bpjs-pcare.error';
import { BpjsPcareConnection } from './bpjs-pcare.types';

describe('BpjsPcareHttpClient', () => {
  const inputConnection: BpjsPcareConnection = {
    environment: 'DEVELOPMENT',
    credentials: {
      consId: '20250001',
      secretKey: '0kSp1keSecretKey',
      userKey: 'b1a2c3d4e5f60718293a4b5c6d7e8f90',
      pcareUsername: 'klinik-demo',
      pcarePassword: 'RahasiaPcare123',
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

  function buildClient(env: Record<string, string> = {}): BpjsPcareHttpClient {
    return new BpjsPcareHttpClient(
      new ConfigService({ BPJS_PCARE_RETRY_BASE_DELAY_MS: '1', ...env }),
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

  it('signs the request, decodes with the sent timestamp, and returns the envelope', async () => {
    const expectedPayload = { list: [{ kdPoli: '001', nmPoli: 'POLI UMUM' }] };
    fetchMock.mockImplementation(respondWithEncryptedPayload(expectedPayload));
    const client = buildClient();

    const actualEnvelope = await client.sendRequest(inputConnection, {
      method: 'GET',
      path: 'poli/fktp/0/1',
    });

    expect(actualEnvelope.response).toEqual(expectedPayload);
    const [actualUrl, actualInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe('https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev/poli/fktp/0/1');
    const actualHeaders = actualInit.headers as Record<string, string>;
    expect(actualHeaders['X-cons-id']).toBe('20250001');
    expect(actualHeaders['X-Signature']).toBeDefined();
    expect(actualHeaders['X-Authorization']).toMatch(/^Basic /);
    expect(actualHeaders.user_key).toBe(inputConnection.credentials.userKey);
  });

  it('routes PRODUCTION connections to the production base URL', async () => {
    fetchMock.mockImplementation(respondWithEncryptedPayload({ ok: true }));
    const client = buildClient();

    await client.sendRequest(
      { ...inputConnection, environment: 'PRODUCTION' },
      { method: 'GET', path: 'poli/fktp/0/1' },
    );

    const [actualUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe('https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0/poli/fktp/0/1');
  });

  it('maps a PCare metaData rejection to BPJS_PCARE_REQUEST_REJECTED with the upstream message', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(
          JSON.stringify({ metaData: { code: '204', message: 'DATA TIDAK ADA' }, response: null }),
          { status: 200 },
        ),
    );
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, { method: 'GET', path: 'peserta/x' });

    await expect(actualCall).rejects.toMatchObject({
      code: 'BPJS_PCARE_REQUEST_REJECTED',
      message: expect.stringContaining('DATA TIDAK ADA') as string,
    });
  });

  it('retries an idempotent request after an upstream failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockImplementationOnce(respondWithEncryptedPayload({ ok: true }));
    const client = buildClient();

    const actualEnvelope = await client.sendRequest(inputConnection, {
      method: 'GET',
      path: 'poli/fktp/0/1',
    });

    expect(actualEnvelope.response).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a POST', async () => {
    fetchMock.mockResolvedValue(new Response('bad gateway', { status: 502 }));
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, {
      method: 'POST',
      path: 'pendaftaran',
      body: { noKartu: '0000123456789' },
    });

    await expect(actualCall).rejects.toMatchObject({ code: 'BPJS_PCARE_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps 401 to BPJS_PCARE_UNAUTHORIZED without retrying', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, {
      method: 'GET',
      path: 'poli/fktp/0/1',
    });

    await expect(actualCall).rejects.toMatchObject({ code: 'BPJS_PCARE_UNAUTHORIZED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a timeout-shaped rejection to BPJS_PCARE_TIMEOUT', async () => {
    fetchMock.mockRejectedValue({ name: 'TimeoutError' });
    const client = buildClient({ BPJS_PCARE_MAX_RETRY_ATTEMPTS: '0' });

    const actualCall = client.sendRequest(inputConnection, {
      method: 'GET',
      path: 'poli/fktp/0/1',
    });

    await expect(actualCall).rejects.toMatchObject({ code: 'BPJS_PCARE_TIMEOUT' });
  });

  it('surfaces a codec failure as a typed BpjsPcareError', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ metaData: { code: '200', message: 'OK' }, response: 'not-decryptable' }),
        { status: 200 },
      ),
    );
    const client = buildClient();

    const actualCall = client.sendRequest(inputConnection, {
      method: 'GET',
      path: 'poli/fktp/0/1',
    });

    await expect(actualCall).rejects.toBeInstanceOf(BpjsPcareError);
    await expect(actualCall).rejects.toMatchObject({
      code: expect.stringMatching(/^BPJS_PCARE_(DECRYPT_FAILED|DECOMPRESS_FAILED)$/) as string,
    });
  });

  it('opens the circuit after consecutive transport failures and fails fast', async () => {
    fetchMock.mockResolvedValue(new Response('bad gateway', { status: 502 }));
    const client = buildClient({
      BPJS_PCARE_MAX_RETRY_ATTEMPTS: '0',
      BPJS_PCARE_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });
    const sendOnce = (): Promise<unknown> =>
      client.sendRequest(inputConnection, { method: 'GET', path: 'poli/fktp/0/1' });

    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_PCARE_UNAVAILABLE' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_PCARE_UNAVAILABLE' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_PCARE_CIRCUIT_OPEN' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('records a business rejection as breaker success so the circuit stays closed', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(
          JSON.stringify({ metaData: { code: '412', message: 'PESERTA TIDAK DITEMUKAN' } }),
          { status: 200 },
        ),
    );
    const client = buildClient({ BPJS_PCARE_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2' });
    const sendOnce = (): Promise<unknown> =>
      client.sendRequest(inputConnection, { method: 'GET', path: 'peserta/x' });

    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_PCARE_REQUEST_REJECTED' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_PCARE_REQUEST_REJECTED' });
    await expect(sendOnce()).rejects.toMatchObject({ code: 'BPJS_PCARE_REQUEST_REJECTED' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
