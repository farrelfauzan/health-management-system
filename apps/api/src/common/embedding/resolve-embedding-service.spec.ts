import { ConfigService } from '@nestjs/config';

import { OllamaEmbeddingService } from './ollama-embedding.service';
import { resolveEmbeddingService } from './resolve-embedding-service';
import { SumopodEmbeddingService } from './sumopod-embedding.service';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = { ...overrides };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/**
 * The switch is read from the resolved instance rather than by inspection,
 * which is the only way the D-EMB-01 claim — that moving a clinic between a
 * hosted and a local embedder is configuration — stays honest.
 */
describe('resolveEmbeddingService', () => {
  const sumopodService = {} as SumopodEmbeddingService;
  const ollamaService = {} as OllamaEmbeddingService;

  it('binds the hosted provider by default', () => {
    const actual = resolveEmbeddingService(buildConfigService(), sumopodService, ollamaService);

    expect(actual).toBe(sumopodService);
  });

  it('binds the hosted provider when named', () => {
    const actual = resolveEmbeddingService(
      buildConfigService({ EMBEDDING_PROVIDER: 'SUMOPOD' }),
      sumopodService,
      ollamaService,
    );

    expect(actual).toBe(sumopodService);
  });

  it('binds the local provider when named', () => {
    const actual = resolveEmbeddingService(
      buildConfigService({ EMBEDDING_PROVIDER: 'OLLAMA' }),
      sumopodService,
      ollamaService,
    );

    expect(actual).toBe(ollamaService);
  });

  it('accepts the value in any case', () => {
    const actual = resolveEmbeddingService(
      buildConfigService({ EMBEDDING_PROVIDER: 'ollama' }),
      sumopodService,
      ollamaService,
    );

    expect(actual).toBe(ollamaService);
  });

  /**
   * The deliberate asymmetry with `WA_GATEWAY_KIND`, which normalises an
   * unrecognised value to its primary. Picking the wrong bridge still
   * delivers the message; picking the wrong embedder silently decides which
   * company sees the clinic's documents, so a typo must not be guessed at.
   */
  it('refuses an unrecognised provider instead of falling back to one', () => {
    expect(() =>
      resolveEmbeddingService(
        buildConfigService({ EMBEDDING_PROVIDER: 'OPENAI' }),
        sumopodService,
        ollamaService,
      ),
    ).toThrow(/EMBEDDING_PROVIDER must be one of/);
  });
});
