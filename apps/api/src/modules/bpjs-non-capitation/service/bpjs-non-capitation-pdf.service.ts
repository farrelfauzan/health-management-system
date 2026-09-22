import { NonCapitationRecapResponse } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { buildNonCapitationLetterHtml } from './build-non-capitation-letter-html';

/** A4 landscape: the line table is twelve columns wide. */
const A4_LANDSCAPE = { paperWidthInches: 11.69, paperHeightInches: 8.27, landscape: true } as const;
const PAGE_MARGIN_INCHES = { top: 0.5, right: 0.5, bottom: 0.6, left: 0.5 } as const;

/**
 * Renders the letter to the induk FKTP with the month's recap (P25-T16)
 * through the shared renderer, as the KIA reports do. Rendered per request,
 * never stored.
 */
@Injectable()
export class BpjsNonCapitationPdfService {
  constructor(
    private readonly pdfRendererService: PdfRendererService,
    private readonly clinicProfileService: ClinicProfileService,
  ) {}

  async renderLetter(recap: NonCapitationRecapResponse): Promise<Uint8Array> {
    const identity = await this.clinicProfileService.getReportingIdentity();
    return this.pdfRendererService.render(buildNonCapitationLetterHtml(recap, identity), {
      ...A4_LANDSCAPE,
      marginInches: PAGE_MARGIN_INCHES,
      printBackground: true,
      traceId: `bpjs-non-capitation:${recap.month}`,
    });
  }
}
