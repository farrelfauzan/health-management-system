import { Module } from '@nestjs/common';

import { EmbeddingService } from './embedding.service';
import { OllamaEmbeddingService } from './ollama-embedding.service';

/**
 * Registers the provider-neutral embedding contract backed by the local
 * Ollama adapter. Feature modules import this module and inject
 * {@link EmbeddingService}; they never call an embedding endpoint directly.
 *
 * Shared rather than private to `document-management` because `P15-T11`
 * retrieval must embed the *question* with the same model, version, and width
 * that embedded the chunks — two configurations would be two vector spaces,
 * and comparing across them returns plausible nonsense rather than an error.
 */
@Module({
  providers: [
    {
      provide: EmbeddingService,
      useClass: OllamaEmbeddingService,
    },
  ],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
