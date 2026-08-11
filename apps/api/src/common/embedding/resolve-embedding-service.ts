import { ConfigService } from '@nestjs/config';

import { resolveEmbeddingConfig } from './embedding.config';
import { EmbeddingService } from './embedding.service';
import { OllamaEmbeddingService } from './ollama-embedding.service';
import { TogetherEmbeddingService } from './together-embedding.service';

/**
 * Picks the embedding backend from `EMBEDDING_PROVIDER` (`PCS-T12`, D-EMB-01).
 *
 * **This function is the whole of the switch**, mirroring
 * `resolveWhatsappAdapter`: the choice exists in exactly one place, is made
 * once at startup, and is provable by a test that reads the resolved instance
 * rather than by inspection.
 *
 * Both adapters are constructed rather than only the selected one, which costs
 * nothing — neither opens a connection in its constructor — and buys something
 * worth having: the unselected adapter is still instantiated on every boot, so
 * a change that breaks its construction fails immediately instead of on the
 * day somebody moves a clinic back to local embeddings, which is the worst
 * possible day to discover it.
 *
 * There is no default branch. An unrecognised `EMBEDDING_PROVIDER` has already
 * thrown in the config resolver, because a typo here would decide which
 * company sees the clinic's documents and that is not a question to answer by
 * guessing.
 */
export function resolveEmbeddingService(
  configService: ConfigService,
  togetherService: TogetherEmbeddingService,
  ollamaService: OllamaEmbeddingService,
): EmbeddingService {
  const { kind } = resolveEmbeddingConfig(configService);
  return kind === 'OLLAMA' ? ollamaService : togetherService;
}
