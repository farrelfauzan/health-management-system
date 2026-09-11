import { ConfigService } from '@nestjs/config';

import { SatusehatKfaClient } from './satusehat-kfa.client';
import { SatusehatTokenClient } from './satusehat-token.client';

const CONFIGURED_VALUES: Record<string, string> = {
  SATUSEHAT_KFA_BASE_URL: 'https://kfa.test/kfa-v2',
  SATUSEHAT_ORGANIZATION_ID: '10000004',
  SATUSEHAT_CLIENT_ID: 'client-id',
  SATUSEHAT_CLIENT_SECRET: 'client-secret',
};

function buildConfigService(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildTokenClient(): SatusehatTokenClient {
  return {
    getAccessToken: jest.fn().mockResolvedValue('access-token'),
  } as unknown as SatusehatTokenClient;
}

function buildResponse(status: number, payload: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function buildClient(values: Record<string, string> = CONFIGURED_VALUES): SatusehatKfaClient {
  return new SatusehatKfaClient(buildConfigService(values), buildTokenClient());
}

describe('SatusehatKfaClient', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('refuses to call the platform when credentials are absent', async () => {
    const client = buildClient({ SATUSEHAT_KFA_BASE_URL: 'https://kfa.test/kfa-v2' });

    await expect(client.searchProducts('paracetamol', 20)).rejects.toMatchObject({
      code: 'SATUSEHAT_NOT_CONFIGURED',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends a bearer-authenticated pharmacy product search', async () => {
    mockFetch.mockResolvedValue(buildResponse(200, { items: { data: [] } }));
    const client = buildClient();

    await client.searchProducts('paracetamol', 15);

    const [actualUrl, actualInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const url = new URL(actualUrl);
    expect(url.origin + url.pathname).toBe('https://kfa.test/kfa-v2/products/all');
    expect(url.searchParams.get('keyword')).toBe('paracetamol');
    expect(url.searchParams.get('size')).toBe('15');
    expect(url.searchParams.get('product_type')).toBe('farmasi');
    expect((actualInit.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('maps the nested items shape to products', async () => {
    mockFetch.mockResolvedValue(
      buildResponse(200, {
        items: {
          data: [
            {
              kfa_code: '93011120',
              name: 'Paracetamol 500 mg Tablet (KIMIA FARMA)',
              active: true,
              manufacturer: 'KIMIA FARMA',
              dosage_form: { name: 'Tablet' },
              uom: { name: 'Tablet' },
            },
          ],
        },
      }),
    );
    const client = buildClient();

    const actualProducts = await client.searchProducts('paracetamol', 20);

    expect(actualProducts).toEqual([
      {
        kfaCode: '93011120',
        name: 'Paracetamol 500 mg Tablet (KIMIA FARMA)',
        dosageForm: 'Tablet',
        manufacturer: 'KIMIA FARMA',
        packagingUnit: 'Tablet',
        isActive: true,
      },
    ]);
  });

  it('reads a bare items array and fills absent detail with null', async () => {
    mockFetch.mockResolvedValue(
      buildResponse(200, { items: [{ kfa_code: '93007575', name: 'Amoxicillin', active: false }] }),
    );
    const client = buildClient();

    const actualProducts = await client.searchProducts('amoxicillin', 20);

    expect(actualProducts).toEqual([
      {
        kfaCode: '93007575',
        name: 'Amoxicillin',
        dosageForm: null,
        manufacturer: null,
        packagingUnit: null,
        isActive: false,
      },
    ]);
  });

  it('drops a row that carries no code or no name, since it cannot be chosen', async () => {
    mockFetch.mockResolvedValue(
      buildResponse(200, {
        items: [{ name: 'No code here', active: true }, { kfa_code: '93000001', active: true }],
      }),
    );
    const client = buildClient();

    await expect(client.searchProducts('anything', 20)).resolves.toEqual([]);
  });

  it.each([
    [401, 'SATUSEHAT_UNAUTHORIZED'],
    [403, 'SATUSEHAT_UNAUTHORIZED'],
    [429, 'SATUSEHAT_UNAVAILABLE'],
    [503, 'SATUSEHAT_UNAVAILABLE'],
    [400, 'SATUSEHAT_REQUEST_REJECTED'],
  ])('maps HTTP %i to %s', async (status, expectedCode) => {
    mockFetch.mockResolvedValue(buildResponse(status));
    const client = buildClient();

    await expect(client.searchProducts('paracetamol', 20)).rejects.toMatchObject({
      code: expectedCode,
      upstreamStatusCode: status,
    });
  });

  it('maps a body that is not an object to an unavailable platform', async () => {
    mockFetch.mockResolvedValue(buildResponse(200, 'not json'));
    const client = buildClient();

    await expect(client.searchProducts('paracetamol', 20)).rejects.toMatchObject({
      code: 'SATUSEHAT_UNAVAILABLE',
    });
  });
});
