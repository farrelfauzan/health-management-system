import { generateKeyPairSync, KeyObject } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { decryptSatusehatKycMessage } from './decrypt-satusehat-kyc-message';
import { encryptSatusehatKycMessage } from './encrypt-satusehat-kyc-message';
import { SatusehatKycClient } from './satusehat-kyc.client';
import { SatusehatTokenClient } from './satusehat-token.client';

type PemPair = { readonly privateKeyPem: string; readonly publicKeyPem: string };

function generatePemPair(): PemPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

function toKeyObject(pem: string, kind: 'private' | 'public'): KeyObject {
  // Imported lazily so the spec reads as a wire test, not a crypto one.
  const crypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return kind === 'private' ? crypto.createPrivateKey(pem) : crypto.createPublicKey(pem);
}

const deployment = generatePemPair();
const server = generatePemPair();

const CONFIGURED_VALUES: Record<string, string> = {
  SATUSEHAT_KYC_BASE_URL: 'https://api-satusehat-stg.dto.kemkes.go.id/kyc/v1',
  SATUSEHAT_ORGANIZATION_ID: 'org-id',
  SATUSEHAT_CLIENT_ID: 'client-id',
  SATUSEHAT_CLIENT_SECRET: 'client-secret',
  SATUSEHAT_KYC_PRIVATE_KEY: deployment.privateKeyPem,
  SATUSEHAT_KYC_PUBLIC_KEY: deployment.publicKeyPem,
  SATUSEHAT_KYC_SERVER_PUBLIC_KEY: server.publicKeyPem,
};

/** A NIK-shaped placeholder: sixteen digits that are nobody's number. */
const AGENT_NIK_PLACEHOLDER = '0000000000000000';
const AGENT = { name: 'Bidan Sari', nik: AGENT_NIK_PLACEHOLDER } as const;

function buildConfigService(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildTokenClient(): SatusehatTokenClient {
  return {
    getAccessToken: jest.fn().mockResolvedValue('access-token'),
  } as unknown as SatusehatTokenClient;
}

function buildTextResponse(status: number, text: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(text),
  } as unknown as Response;
}

/** What the platform sends back on success: the envelope, sealed for our public key. */
function buildArmouredSuccess(data: Record<string, string>): string {
  return encryptSatusehatKycMessage({
    plaintext: JSON.stringify({ metadata: { code: '200', message: 'OK' }, data }),
    serverPublicKey: toKeyObject(deployment.publicKeyPem, 'public'),
  });
}

function buildClient(values: Record<string, string> = CONFIGURED_VALUES): SatusehatKycClient {
  return new SatusehatKycClient(buildConfigService(values), buildTokenClient());
}

describe('SatusehatKycClient (P24-T14)', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('reports enabled with no reason when the keys are configured', () => {
    expect(buildClient().getStatus()).toEqual({ isEnabled: true, disabledReason: null });
  });

  it('reports disabled with the reason, and refuses to call the platform', async () => {
    const client = buildClient({
      ...CONFIGURED_VALUES,
      SATUSEHAT_KYC_PRIVATE_KEY: '',
      SATUSEHAT_KYC_PUBLIC_KEY: '',
      SATUSEHAT_KYC_SERVER_PUBLIC_KEY: '',
    });

    expect(client.getStatus()).toEqual({
      isEnabled: false,
      disabledReason: 'KYC_KEYS_NOT_CONFIGURED',
    });
    await expect(client.generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_KYC_DISABLED',
      message: expect.stringContaining('KYC_KEYS_NOT_CONFIGURED'),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends the armoured envelope as text/plain and decrypts the typed answer', async () => {
    mockFetch.mockResolvedValue(
      buildTextResponse(
        200,
        buildArmouredSuccess({
          agent_name: AGENT.name,
          agent_nik: AGENT.nik,
          token: 'tok-123',
          url: 'https://kyc.example/validate?token=tok-123',
        }),
      ),
    );

    const actual = await buildClient().generateValidationUrl(AGENT);

    expect(actual).toEqual({ url: 'https://kyc.example/validate?token=tok-123', token: 'tok-123' });
    const [actualUrl, actualInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe('https://api-satusehat-stg.dto.kemkes.go.id/kyc/v1/generate-url');
    expect(actualInit.method).toBe('POST');
    const headers = actualInit.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('text/plain');
    expect(headers.Authorization).toBe('Bearer access-token');
    const wireBody = String(actualInit.body);
    expect(wireBody.startsWith('-----BEGIN ENCRYPTED MESSAGE-----\r\n')).toBe(true);
    expect(wireBody.endsWith('\r\n-----END ENCRYPTED MESSAGE-----')).toBe(true);
    expect(wireBody).not.toContain(AGENT.nik);
    expect(wireBody).not.toContain('agent_name');
  });

  it('puts the operator and our public key inside the sealed request', async () => {
    mockFetch.mockResolvedValue(
      buildTextResponse(200, buildArmouredSuccess({ url: 'https://kyc.example/v', token: 't' })),
    );

    await buildClient().generateValidationUrl(AGENT);

    const [, actualInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const plaintext = decryptSatusehatKycMessage({
      armoured: String(actualInit.body),
      privateKey: toKeyObject(server.privateKeyPem, 'private'),
    });
    expect(JSON.parse(plaintext)).toEqual({
      agent_name: AGENT.name,
      agent_nik: AGENT.nik,
      public_key: deployment.publicKeyPem,
    });
  });

  it('turns HTTP 200 with metadata.code 400 into a typed rejection, never a success', async () => {
    mockFetch.mockResolvedValue(
      buildTextResponse(
        200,
        JSON.stringify({
          metadata: { code: '400', message: 'Bad Request' },
          data: { error: 'Failed to decrypt message' },
        }),
      ),
    );

    const failure: Error = await buildClient()
      .generateValidationUrl(AGENT)
      .then(() => new Error('expected a rejection'))
      .catch((caughtError: unknown) => caughtError as Error);

    expect(failure).toMatchObject({ code: 'SATUSEHAT_KYC_REJECTED' });
    expect(failure.message).toBe(
      'SATUSEHAT KYC rejected the request (code 400): Failed to decrypt message; Bad Request',
    );
  });

  it('masks a NIK the platform echoes in its error text', async () => {
    mockFetch.mockResolvedValue(
      buildTextResponse(
        200,
        JSON.stringify({
          metadata: { code: '400' },
          data: { error: `agent_nik ${AGENT_NIK_PLACEHOLDER} is not registered` },
        }),
      ),
    );

    const failure: Error = await buildClient()
      .generateValidationUrl(AGENT)
      .then(() => new Error('expected a rejection'))
      .catch((caughtError: unknown) => caughtError as Error);

    expect(failure.message).toContain('agent_nik [NIK] is not registered');
    expect(failure.message).not.toContain(AGENT_NIK_PLACEHOLDER);
  });

  it('maps a 401 inside the body to the credentials error', async () => {
    mockFetch.mockResolvedValue(
      buildTextResponse(200, JSON.stringify({ metadata: { code: '401' }, data: {} })),
    );

    await expect(buildClient().generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAUTHORIZED',
    });
  });

  it('maps a 5xx inside the body to unavailable', async () => {
    mockFetch.mockResolvedValue(
      buildTextResponse(200, JSON.stringify({ metadata: { code: '503' }, data: {} })),
    );

    await expect(buildClient().generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
    });
  });

  it('still honours a transport-level HTTP failure', async () => {
    mockFetch.mockResolvedValue(buildTextResponse(502, ''));

    await expect(buildClient().generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
      upstreamStatusCode: 502,
    });
  });

  it('refuses an armoured answer sealed for somebody else', async () => {
    const stranger = generatePemPair();
    mockFetch.mockResolvedValue(
      buildTextResponse(
        200,
        encryptSatusehatKycMessage({
          plaintext: JSON.stringify({ metadata: { code: '200' }, data: { url: 'x' } }),
          serverPublicKey: toKeyObject(stranger.publicKeyPem, 'public'),
        }),
      ),
    );

    await expect(buildClient().generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_KYC_REJECTED',
      message: expect.stringContaining('could not be decrypted'),
    });
  });

  it('refuses a success envelope that carries no URL', async () => {
    mockFetch.mockResolvedValue(buildTextResponse(200, buildArmouredSuccess({ token: 't' })));

    await expect(buildClient().generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_KYC_REJECTED',
      message: expect.stringContaining('without a validation URL'),
    });
  });

  it('makes exactly one attempt on a timeout: a POST is never replayed', async () => {
    const timeoutError = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    mockFetch.mockRejectedValue(timeoutError);

    await expect(buildClient().generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_TIMEOUT',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated transport failures', async () => {
    mockFetch.mockRejectedValue(new Error('connection reset'));
    const client = buildClient({
      ...CONFIGURED_VALUES,
      SATUSEHAT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });

    await expect(client.generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
    });
    await expect(client.generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
    });
    await expect(client.generateValidationUrl(AGENT)).rejects.toMatchObject({
      code: 'SATUSEHAT_CIRCUIT_OPEN',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
