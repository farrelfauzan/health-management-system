import { Module } from '@nestjs/common';

import { GotenbergPdfRendererService } from './gotenberg-pdf-renderer.service';
import { PdfEncryptionService } from './pdf-encryption.service';
import { PdfRendererService } from './pdf-renderer.service';

/**
 * Registers the provider-neutral HTML→PDF contract backed by the Gotenberg
 * adapter (**D-026**). Feature modules import this module and inject
 * {@link PdfRendererService}; they never speak HTTP to a renderer directly.
 *
 * {@link PdfEncryptionService} (`P16-T37`) sits beside it as the step between
 * render and transport: the sidecar cannot encrypt, so the API does.
 */
@Module({
  providers: [
    {
      provide: PdfRendererService,
      useClass: GotenbergPdfRendererService,
    },
    PdfEncryptionService,
  ],
  exports: [PdfRendererService, PdfEncryptionService],
})
export class PdfModule {}
