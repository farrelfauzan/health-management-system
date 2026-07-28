import { ConfigService } from '@nestjs/config';

import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatTokenClient } from './satusehat-token.client';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: 'org-uuid',
    SATUSEHAT_CLIENT_ID: 'client-id',
    SATUSEHAT_CLIENT_SECRET: 'client-secret',
    SATUSEHAT_RETRY_BASE_DELAY_MS: '1',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

type MockTokenClient = {
  getAccessToken: jest.Mock;
  invalidateToken: jest.Mock;
};

function buildTokenClient(): MockTokenClient {
  return {
    getAccessToken: jest.fn().mockResolvedValue('access-token'),
    invalidateToken: jest.fn(),
  };
}

function buildClient(
  tokenClient: MockTokenClient,
  overrides: Record<string, string> = {},
): SatusehatHttpClient {
  return new SatusehatHttpClient(
    buildConfigService(overrides),
    tokenClient as unknown as SatusehatTokenClient,
  );
}

function buildJsonResponse(status: number, payload: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('SatusehatHttpClient', () => {
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
    const tokenClient = buildTokenClient();
    const client = new SatusehatHttpClient(
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      tokenClient as unknown as SatusehatTokenClient,
    );

    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_NOT_CONFIGURED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends a bearer-authenticated request to the FHIR base URL with query parameters', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(200, { resourceType: 'Bundle' }));
    const client = buildClient(buildTokenClient());

    const actualResult = await client.sendRequest<{ resourceType: string }>({
      method: 'GET',
      path: '/Patient',
      query: { identifier: 'https://fhir.kemkes.go.id/id/nik|1234567890123456' },
    });

    expect(actualResult).toEqual({ resourceType: 'Bundle' });
    const [actualUrl, actualInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe(
      'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Patient?identifier=https%3A%2F%2Ffhir.kemkes.go.id%2Fid%2Fnik%7C1234567890123456',
    );
    expect((actualInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-token',
    );
    expect(actualInit.body).toBeUndefined();
  });

  it('serializes a JSON body and content type for POST requests', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(201, { resourceType: 'Encounter' }));
    const client = buildClient(buildTokenClient());

    await client.sendRequest({
      method: 'POST',
      path: 'Encounter',
      body: { resourceType: 'Encounter' },
    });

    const [actualUrl, actualInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(actualUrl).toBe('https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Encounter');
    expect(actualInit.body).toBe('{"resourceType":"Encounter"}');
    expect((actualInit.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('refreshes the token and replays the request once on 401', async () => {
    mockFetch
      .mockResolvedValueOnce(buildJsonResponse(401))
      .mockResolvedValueOnce(buildJsonResponse(200, { resourceType: 'Patient' }));
    const tokenClient = buildTokenClient();
    tokenClient.getAccessToken
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    const client = buildClient(tokenClient);

    const actualResult = await client.sendRequest({ method: 'GET', path: '/Patient' });

    expect(actualResult).toEqual({ resourceType: 'Patient' });
    expect(tokenClient.invalidateToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, retriedInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect((retriedInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer fresh-token',
    );
  });

  it('maps a second consecutive 401 to SATUSEHAT_UNAUTHORIZED', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(401));
    const client = buildClient(buildTokenClient());

    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAUTHORIZED',
      upstreamStatusCode: 401,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('maps a 404 to SATUSEHAT_REQUEST_REJECTED without retrying', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(404));
    const client = buildClient(buildTokenClient());

    await expect(client.sendRequest({ method: 'GET', path: '/Patient/x' })).rejects.toMatchObject({
      code: 'SATUSEHAT_REQUEST_REJECTED',
      upstreamStatusCode: 404,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries an idempotent request on 5xx with backoff until attempts are exhausted', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(503));
    const client = buildClient(buildTokenClient(), { SATUSEHAT_MAX_RETRY_ATTEMPTS: '2' });

    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
      upstreamStatusCode: 503,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('recovers when a retry succeeds after a transport failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(buildJsonResponse(200, { resourceType: 'Bundle' }));
    const client = buildClient(buildTokenClient());

    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).resolves.toEqual({
      resourceType: 'Bundle',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('never retries a non-idempotent request', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(503));
    const client = buildClient(buildTokenClient(), { SATUSEHAT_MAX_RETRY_ATTEMPTS: '2' });

    await expect(
      client.sendRequest({ method: 'POST', path: '/Encounter', body: {} }),
    ).rejects.toMatchObject({ code: 'SATUSEHAT_UNAVAILABLE' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after the failure threshold and rejects without calling the upstream', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(503));
    const client = buildClient(buildTokenClient(), {
      SATUSEHAT_MAX_RETRY_ATTEMPTS: '0',
      SATUSEHAT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });

    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
    });
    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
    });
    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_CIRCUIT_OPEN',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the circuit closed on business rejections', async () => {
    mockFetch.mockResolvedValue(buildJsonResponse(422));
    const client = buildClient(buildTokenClient(), {
      SATUSEHAT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });

    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_REQUEST_REJECTED',
    });
    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_REQUEST_REJECTED',
    });
    await expect(client.sendRequest({ method: 'GET', path: '/Patient' })).rejects.toMatchObject({
      code: 'SATUSEHAT_REQUEST_REJECTED',
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
