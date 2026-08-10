import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmbeddingService } from './embedding.service';
import { OllamaEmbeddingService } from './ollama-embedding.service';
import { resolveEmbeddingService } from './resolve-embedding-service';
import { TogetherEmbeddingService } from './together-embedding.service';

/**
 * Registers the provider-neutral embedding contract backed by whichever
 * adapter `EMBEDDING_PROVIDER` names — hosted Together AI by default,
 * local Ollama on request (`PCS-T12`, D-EMB-01). Feature modules import this
 * module and inject {@link EmbeddingService}; they never call an embedding
 * endpoint directly, and nothing downstream knows which vendor answered.
 *
 * Shared rather than private to `document-management` because `P15-T11`
 * retrieval must embed the *question* with the same model, version, and width
 * that embedded the chunks — two configurations would be two vector spaces,
 * and comparing across them returns plausible nonsense rather than an error.
 * That constraint is exactly why the provider is bound **once, here**, instead
 * of being resolved per caller.
 */
@Module({
  providers: [
    TogetherEmbeddingService,
    OllamaEmbeddingService,
    {
      provide: EmbeddingService,
      inject: [ConfigService, TogetherEmbeddingService, OllamaEmbeddingService],
      useFactory: resolveEmbeddingService,
    },
  ],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
