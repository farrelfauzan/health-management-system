import { Module } from '@nestjs/common';

import { GotenbergPdfRendererService } from './gotenberg-pdf-renderer.service';
import { PdfRendererService } from './pdf-renderer.service';

/**
 * Registers the provider-neutral HTML→PDF contract backed by the Gotenberg
 * adapter (**D-026**). Feature modules import this module and inject
 * {@link PdfRendererService}; they never speak HTTP to a renderer directly.
 */
@Module({
  providers: [
    {
      provide: PdfRendererService,
      useClass: GotenbergPdfRendererService,
    },
  ],
  exports: [PdfRendererService],
})
export class PdfModule {}
