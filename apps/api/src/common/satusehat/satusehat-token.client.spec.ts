import { ConfigService } from '@nestjs/config';

import { SatusehatError } from './satusehat.error';
import { SatusehatTokenClient } from './satusehat-token.client';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: 'org-uuid',
    SATUSEHAT_CLIENT_ID: 'client-id',
    SATUSEHAT_CLIENT_SECRET: 'client-secret',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function buildTokenResponse(accessToken = 'token-1', expiresIn: string | number = '3599'): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ access_token: accessToken, expires_in: expiresIn }),
  } as unknown as Response;
}

describe('SatusehatTokenClient', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('throws SATUSEHAT_NOT_CONFIGURED without calling the upstream when credentials are absent', async () => {
    const client = new SatusehatTokenClient(
      {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService,
    );

    await expect(client.getAccessToken()).rejects.toMatchObject({
      code: 'SATUSEHAT_NOT_CONFIGURED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requests a token with the client-credentials form body and caches it', async () => {
    mockFetch.mockResolvedValue(buildTokenResponse());
    const client = new SatusehatTokenClient(buildConfigService());

    const firstToken = await client.getAccessToken();
    const secondToken = await client.getAccessToken();

    expect(firstToken).toBe('token-1');
    expect(secondToken).toBe('token-1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [actualUrl, actualInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe(
      'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken?grant_type=client_credentials',
    );
    expect(actualInit.method).toBe('POST');
    expect(actualInit.body).toBe('client_id=client-id&client_secret=client-secret');
  });

  it('deduplicates concurrent refreshes into a single upstream request', async () => {
    mockFetch.mockResolvedValue(buildTokenResponse());
    const client = new SatusehatTokenClient(buildConfigService());

    const [firstToken, secondToken] = await Promise.all([
      client.getAccessToken(),
      client.getAccessToken(),
    ]);

    expect(firstToken).toBe('token-1');
    expect(secondToken).toBe('token-1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the cached token enters the expiry safety window', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockFetch
      .mockResolvedValueOnce(buildTokenResponse('token-1', '120'))
      .mockResolvedValueOnce(buildTokenResponse('token-2', '3599'));
    const client = new SatusehatTokenClient(buildConfigService());

    await client.getAccessToken();
    nowSpy.mockReturnValue(1_000_000 + 61_000);
    const refreshedToken = await client.getAccessToken();

    expect(refreshedToken).toBe('token-2');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('refetches after invalidateToken', async () => {
    mockFetch
      .mockResolvedValueOnce(buildTokenResponse('token-1'))
      .mockResolvedValueOnce(buildTokenResponse('token-2'));
    const client = new SatusehatTokenClient(buildConfigService());

    await client.getAccessToken();
    client.invalidateToken();
    const refreshedToken = await client.getAccessToken();

    expect(refreshedToken).toBe('token-2');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('maps 401 from the token endpoint to SATUSEHAT_UNAUTHORIZED', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
    const client = new SatusehatTokenClient(buildConfigService());

    await expect(client.getAccessToken()).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAUTHORIZED',
      upstreamStatusCode: 401,
    });
  });

  it('maps a 5xx token response to SATUSEHAT_UNAVAILABLE and retries on the next call', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 } as unknown as Response)
      .mockResolvedValueOnce(buildTokenResponse('token-2'));
    const client = new SatusehatTokenClient(buildConfigService());

    await expect(client.getAccessToken()).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
    });
    await expect(client.getAccessToken()).resolves.toBe('token-2');
  });

  it('maps a timeout abort to SATUSEHAT_TIMEOUT', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'TimeoutError'));
    const client = new SatusehatTokenClient(buildConfigService());

    await expect(client.getAccessToken()).rejects.toMatchObject({
      code: 'SATUSEHAT_TIMEOUT',
    });
  });

  it('rejects an unexpected token payload shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ access_token: '', expires_in: 'never' }),
    } as unknown as Response);
    const client = new SatusehatTokenClient(buildConfigService());

    const actualError = await client.getAccessToken().catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(SatusehatError);
    expect((actualError as SatusehatError).code).toBe('SATUSEHAT_UNAVAILABLE');
  });
});
