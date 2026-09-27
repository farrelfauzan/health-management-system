import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';

import { SumopodEmbeddingService } from './sumopod-embedding.service';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    EMBEDDING_PROVIDER: 'SUMOPOD',
    SUMOPOD_API_KEY: 'test-key',
    SUMOPOD_EMBEDDING_BASE_URL: 'https://sumopod.test/v1',
    SUMOPOD_EMBEDDING_MODEL: 'text-embedding-3-large',
    SUMOPOD_EMBEDDING_VERSION: '1',
    SUMOPOD_EMBEDDING_DIMENSION: '3',
    SUMOPOD_EMBEDDING_BATCH_SIZE: '2',
    SUMOPOD_EMBEDDING_MAX_RETRIES: '0',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildVector(seed = 0.1): number[] {
  return [seed, seed + 0.1, seed + 0.2];
}

function buildEntry(index: number, seed: number): Record<string, unknown> {
  return { index, object: 'embedding', embedding: buildVector(seed) };
}

describe('SumopodEmbeddingService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function respondWith(data: unknown, ok = true, status = 200, resetSeconds?: string): void {
    fetchMock.mockResolvedValue({
      ok,
      status,
      headers: {
        get: (name: string) => (name === 'retry-after' ? (resetSeconds ?? null) : null),
      },
      json: () => Promise.resolve({ data, model: 'text-embedding-3-large' }),
    });
  }

  it('posts to the OpenAI-compatible endpoint with the configured model, width, and a bearer key', async () => {
    respondWith([buildEntry(0, 0.1)]);

    await new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sumopod.test/v1/embeddings');
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'text-embedding-3-large',
      input: ['satu'],
      dimensions: 3,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('strips a trailing slash from the base URL rather than producing a double slash', async () => {
    respondWith([buildEntry(0, 0.1)]);

    await new SumopodEmbeddingService(
      buildConfigService({ SUMOPOD_EMBEDDING_BASE_URL: 'https://sumopod.test/v1/' }),
    ).embedTexts({ texts: ['satu'] });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://sumopod.test/v1/embeddings');
  });

  it('names the missing variable instead of letting the provider answer 401', async () => {
    const service = new SumopodEmbeddingService(buildConfigService({ SUMOPOD_API_KEY: '' }));

    await expect(service.embedTexts({ texts: ['satu'] })).rejects.toThrow(/SUMOPOD_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks nothing of the provider for an empty input, key or no key', async () => {
    const service = new SumopodEmbeddingService(buildConfigService({ SUMOPOD_API_KEY: '' }));

    const actual = await service.embedTexts({ texts: [] });

    expect(actual.embeddings).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('splits inputs into batches of the configured size', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ data: [buildEntry(0, 0.1), buildEntry(1, 0.2)] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ data: [buildEntry(0, 0.3)] }),
      });

    const actual = await new SumopodEmbeddingService(buildConfigService()).embedTexts({
      texts: ['satu', 'dua', 'tiga'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(actual.embeddings).toHaveLength(3);
  });

  /**
   * The behaviour the Ollama adapter has no equivalent of. Ollama answers with
   * a bare positional array; the OpenAI shape carries an index, and trusting
   * arrival order where an index exists would attach chunk N's text to chunk
   * M's meaning with nothing downstream able to detect it.
   */
  it('re-sorts vectors by their index rather than trusting arrival order', async () => {
    respondWith([buildEntry(1, 0.7), buildEntry(0, 0.1)]);

    const actual = await new SumopodEmbeddingService(buildConfigService()).embedTexts({
      texts: ['satu', 'dua'],
    });

    expect(actual.embeddings[0]).toEqual(buildVector(0.1));
    expect(actual.embeddings[1]).toEqual(buildVector(0.7));
  });

  it('falls back to arrival order when the provider omits the index', async () => {
    respondWith([{ embedding: buildVector(0.1) }, { embedding: buildVector(0.7) }]);

    const actual = await new SumopodEmbeddingService(buildConfigService()).embedTexts({
      texts: ['satu', 'dua'],
    });

    expect(actual.embeddings[0]).toEqual(buildVector(0.1));
    expect(actual.embeddings[1]).toEqual(buildVector(0.7));
  });

  it('refuses a duplicate index instead of silently dropping an input', async () => {
    respondWith([buildEntry(0, 0.1), buildEntry(0, 0.7)]);

    await expect(
      new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu', 'dua'] }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('refuses an out-of-range index', async () => {
    respondWith([buildEntry(5, 0.1)]);

    await expect(
      new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(/out-of-range/);
  });

  it('refuses a vector count that does not match the input count', async () => {
    respondWith([buildEntry(0, 0.1)]);

    await expect(
      new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu', 'dua'] }),
    ).rejects.toThrow(/1 vectors for 2 inputs/);
  });

  it('refuses a vector of the wrong width and names the variable to check', async () => {
    respondWith([{ index: 0, embedding: [0.1, 0.2] }]);

    await expect(
      new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(/SUMOPOD_EMBEDDING_MODEL/);
  });

  it('refuses a non-numeric vector', async () => {
    respondWith([{ index: 0, embedding: ['a', 'b', 'c'] }]);

    await expect(
      new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(/non-numeric/);
  });

  it('surfaces the status but never the upstream body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: () => Promise.resolve({ error: 'your input was: NIK 3171020344050001' }),
    });

    await expect(
      new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow('Embedding provider responded with status 400');
  });

  it('does not retry a 400, which would answer identically however often it is asked', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: () => Promise.resolve({}),
    });

    await expect(
      new SumopodEmbeddingService(
        buildConfigService({ SUMOPOD_EMBEDDING_MAX_RETRIES: '3' }),
      ).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 within the budget and succeeds on a later attempt', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name === 'retry-after' ? '0' : null) },
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ data: [buildEntry(0, 0.1)] }),
      });

    const actual = await new SumopodEmbeddingService(
      buildConfigService({ SUMOPOD_EMBEDDING_MAX_RETRIES: '2' }),
    ).embedTexts({ texts: ['satu'] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(actual.embeddings[0]).toEqual(buildVector(0.1));
  });

  it('gives up after the configured number of retries', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: (name: string) => (name === 'retry-after' ? '0' : null) },
      json: () => Promise.resolve({}),
    });

    await expect(
      new SumopodEmbeddingService(
        buildConfigService({ SUMOPOD_EMBEDDING_MAX_RETRIES: '2' }),
      ).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow('Embedding provider responded with status 503');
    // The first attempt plus two retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('honours a retry budget of zero', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => '0' },
      json: () => Promise.resolve({}),
    });

    await expect(
      new SumopodEmbeddingService(
        buildConfigService({ SUMOPOD_EMBEDDING_MAX_RETRIES: '0' }),
      ).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable provider without leaking the request', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(
      new SumopodEmbeddingService(buildConfigService()).embedTexts({ texts: ['rahasia'] }),
    ).rejects.toThrow('Embedding provider is unreachable');
  });

  it('stamps the model, version, and dimension it was configured with', async () => {
    respondWith([buildEntry(0, 0.1)]);

    const actual = await new SumopodEmbeddingService(buildConfigService()).embedTexts({
      texts: ['satu'],
    });

    expect(actual.model).toBe('text-embedding-3-large');
    expect(actual.version).toBe('1');
    expect(actual.dimension).toBe(3);
  });
});
