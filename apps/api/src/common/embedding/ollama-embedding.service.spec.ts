import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';

import { OllamaEmbeddingService } from './ollama-embedding.service';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    OLLAMA_EMBEDDING_BASE_URL: 'http://ollama.test:11434',
    OLLAMA_EMBEDDING_MODEL: 'bge-m3',
    OLLAMA_EMBEDDING_VERSION: '1',
    OLLAMA_EMBEDDING_DIMENSION: '3',
    OLLAMA_EMBEDDING_BATCH_SIZE: '2',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildVector(): number[] {
  return [0.1, 0.2, 0.3];
}

describe('OllamaEmbeddingService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function respondWith(embeddings: unknown, ok = true, status = 200): void {
    fetchMock.mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve({ embeddings }),
    });
  }

  it('posts to the native /api/embed endpoint with the configured model', async () => {
    respondWith([buildVector()]);

    await new OllamaEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ollama.test:11434/api/embed');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'bge-m3', input: ['satu'] });
  });

  it('strips a trailing slash from the base URL rather than producing a double slash', async () => {
    respondWith([buildVector()]);

    await new OllamaEmbeddingService(
      buildConfigService({ OLLAMA_EMBEDDING_BASE_URL: 'http://ollama.test:11434/' }),
    ).embedTexts({ texts: ['satu'] });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama.test:11434/api/embed');
  });

  it('batches inputs and preserves overall order across requests', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            embeddings: [
              [1, 1, 1],
              [2, 2, 2],
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ embeddings: [[3, 3, 3]] }),
      });

    const actualResult = await new OllamaEmbeddingService(buildConfigService()).embedTexts({
      texts: ['satu', 'dua', 'tiga'],
    });

    // Order is the contract: chunk N's vector must be chunk N's, or every
    // passage's text ends up attached to a neighbour's meaning.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(actualResult.embeddings).toEqual([
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ]);
  });

  it('contacts nothing for an empty input', async () => {
    const actualResult = await new OllamaEmbeddingService(buildConfigService()).embedTexts({
      texts: [],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actualResult.embeddings).toEqual([]);
  });

  it('refuses a vector whose width does not match the column', async () => {
    // Postgres would accept a 1024-wide vector from the wrong model without
    // complaint, and retrieval would just get worse. Width is the one
    // mechanical half of that failure, so it is refused here.
    respondWith([[0.1, 0.2, 0.3, 0.4]]);

    await expect(
      new OllamaEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(/4 dimensions, expected 3/);
  });

  it('refuses a response with fewer vectors than inputs', async () => {
    respondWith([buildVector()]);

    await expect(
      new OllamaEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu', 'dua'] }),
    ).rejects.toThrow(/1 vectors for 2 inputs/);
  });

  it('reports an upstream status without echoing the response body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'model bge-m3 not found: pull it first' }),
    });

    const actualError = await new OllamaEmbeddingService(buildConfigService())
      .embedTexts({ texts: ['satu'] })
      .catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(ServiceUnavailableException);
    // An upstream error page can quote the prompt it was given.
    expect((actualError as Error).message).toBe('Embedding provider responded with status 500');
  });

  it('reports an unreachable host without leaking the transport error', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    const actualError = await new OllamaEmbeddingService(buildConfigService())
      .embedTexts({ texts: ['satu'] })
      .catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(ServiceUnavailableException);
    expect((actualError as Error).message).toBe('Embedding provider is unreachable');
  });

  it('rejects a non-numeric vector', async () => {
    respondWith([['a', 'b', 'c']]);

    await expect(
      new OllamaEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(/non-numeric vector/);
  });

  it('rejects a payload with no embeddings field', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await expect(
      new OllamaEmbeddingService(buildConfigService()).embedTexts({ texts: ['satu'] }),
    ).rejects.toThrow(/unexpected shape/);
  });

  it('refuses an invalid base URL at construction rather than at the first document', async () => {
    expect(
      () =>
        new OllamaEmbeddingService(buildConfigService({ OLLAMA_EMBEDDING_BASE_URL: 'not a url' })),
    ).toThrow(/must be a valid URL/);
  });

  it('exposes the model, version, and width it stamps on chunks', () => {
    const embeddingService = new OllamaEmbeddingService(buildConfigService());

    expect(embeddingService.model).toBe('bge-m3');
    expect(embeddingService.version).toBe('1');
    expect(embeddingService.dimension).toBe(3);
  });
});
