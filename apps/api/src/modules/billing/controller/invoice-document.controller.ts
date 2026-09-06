import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { INVOICE_DOCUMENT_EXAMPLES } from '../../../common/openapi/invoice-document-examples';
import { InvoiceDocumentService } from '../service/invoice-document.service';

/**
 * The rendered-PDF surface of an invoice (`P16-T06`). It reuses the invoice
 * grants on purpose: a document is part of the invoice, not a separate
 * resource with a separate reach.
 */
@ApiTags('Invoices')
@RequireFeature('invoice-documents')
@Controller({
  version: '1',
  path: 'invoices',
})
export class InvoiceDocumentController {
  constructor(private readonly invoiceDocumentService: InvoiceDocumentService) {}

  @Post(':id/document')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Render the invoice PDF, or return the existing document',
    responseDescription:
      'Idempotent per invoice and snapshotted template version: a READY document is returned without re-rendering, a FAILED one is retried. A DRAFT invoice is refused — issue it first.',
    responseExample: {
      data: INVOICE_DOCUMENT_EXAMPLES.readyView,
      message: 'Invoice document ready',
    },
    notFoundDescription: 'Invoice not found.',
  })
  async renderDocument(@Param('id', new ParseUUIDPipe()) id: string) {
    const document = await this.invoiceDocumentService.requestRender(id);

    return {
      data: document,
      message: document.status === 'READY' ? 'Invoice document ready' : 'Invoice document not ready',
    };
  }

  @Get(':id/document')
  @Auth([{ action: 'read', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Get the invoice document metadata',
    responseDescription:
      'Status, checksum, size, page count, and every warning the render recorded — a blank on the receipt is always accounted for here.',
    responseExample: { data: INVOICE_DOCUMENT_EXAMPLES.readyView },
    notFoundDescription: 'Invoice not found, or no document has been rendered for it.',
  })
  async getDocument(@Param('id', new ParseUUIDPipe()) id: string) {
    const document = await this.invoiceDocumentService.getDocument(id);

    return {
      data: document,
    };
  }

  @Get(':id/document/download')
  @Auth([{ action: 'read', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Get a short-lived download URL for the rendered PDF',
    responseDescription:
      'A presigned GET with attachment disposition and application/pdf pinned. The URL is minted per request, expires on the storage layer’s schedule, and must not be cached or shared.',
    responseExample: { data: INVOICE_DOCUMENT_EXAMPLES.download },
    notFoundDescription: 'Invoice not found, or no document has been rendered for it.',
  })
  async downloadDocument(@Param('id', new ParseUUIDPipe()) id: string) {
    const download = await this.invoiceDocumentService.createDownloadUrl(id);

    return {
      data: download,
    };
  }
}
