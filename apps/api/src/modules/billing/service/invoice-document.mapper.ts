import { Injectable } from '@nestjs/common';

import { InvoiceDocumentRecord, InvoiceDocumentView } from '@hms/shared-types';

/**
 * Record-to-contract projection for rendered invoice documents (`P16-T06`).
 * `storageKey` never leaves the record — downloads are per-request signed
 * URLs minted at the edge of the response (D-018).
 */
@Injectable()
export class InvoiceDocumentMapper {
  toView(record: InvoiceDocumentRecord): InvoiceDocumentView {
    return {
      id: record.id,
      invoiceId: record.invoiceId,
      status: record.status,
      templateVersionId: record.templateVersionId ?? undefined,
      hasVoidWatermark: record.hasVoidWatermark,
      wasBoundRetroactively: record.wasBoundRetroactively,
      checksum: record.checksum ?? undefined,
      sizeBytes: record.sizeBytes ?? undefined,
      pageCount: record.pageCount ?? undefined,
      warnings: record.renderWarnings,
      renderError: record.renderError ?? undefined,
      renderedAt: record.renderedAt?.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
