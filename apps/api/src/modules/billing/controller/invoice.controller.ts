import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BILLING_EXAMPLES } from '../../../common/openapi/billing-examples';
import { AddInvoiceItemDto } from '../dto/add-invoice-item.dto';
import { GenerateInvoiceDto } from '../dto/generate-invoice.dto';
import { ListInvoicesQueryDto } from '../dto/list-invoices-query.dto';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { VoidInvoiceDto } from '../dto/void-invoice.dto';
import { BillingService } from '../service/billing.service';

@ApiTags('Invoices')
@Controller({
  version: '1',
  path: 'invoices',
})
export class InvoiceController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'List invoices',
    responseDescription: 'A filtered, paginated invoice list, newest first.',
    responseExample: {
      data: [BILLING_EXAMPLES.invoice.listItem],
      meta: BILLING_EXAMPLES.paginationMeta,
    },
  })
  async listInvoices(@Query() query: ListInvoicesQueryDto) {
    const result = await this.billingService.listInvoices(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Get an invoice',
    responseDescription: 'The invoice with its billed lines and settlement, if any.',
    responseExample: {
      data: {
        ...BILLING_EXAMPLES.invoice.listItem,
        items: BILLING_EXAMPLES.invoice.detailItems,
      },
    },
    notFoundDescription: 'Invoice not found.',
  })
  async getInvoiceById(@Param('id', new ParseUUIDPipe()) id: string) {
    const invoice = await this.billingService.getInvoiceById(id);

    return {
      data: invoice,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Generate an invoice from a finished encounter',
    responseDescription:
      'A DRAFT invoice auto-collected from the visit: consultation fee, tariffed procedures, dispensed medications. Whatever could not be priced is listed in meta.gaps.',
    responseExample: {
      data: {
        ...BILLING_EXAMPLES.invoice.listItem,
        status: 'DRAFT',
        items: BILLING_EXAMPLES.invoice.detailItems,
      },
      meta: { gaps: BILLING_EXAMPLES.invoice.generationGaps },
      message: 'Invoice generated',
    },
    requestType: GenerateInvoiceDto,
    requestExample: BILLING_EXAMPLES.invoice.generateRequest,
    successStatus: 201,
  })
  async generateInvoice(
    @Body() payload: GenerateInvoiceDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.billingService.generateInvoice(payload, actor);

    return {
      data: result.invoice,
      meta: { gaps: result.gaps },
      message: 'Invoice generated',
    };
  }

  @Post(':id/items')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Add a tariff line to a draft invoice',
    responseDescription:
      'The DRAFT invoice with the new line and a recomputed total. This is how a tariff generation cannot match on its own — one without an ICD-9-CM mapping, or an OTHER charge — reaches the bill. Only DRAFT invoices accept lines; correct anything later by voiding and reissuing.',
    responseExample: {
      data: {
        ...BILLING_EXAMPLES.invoice.listItem,
        status: 'DRAFT',
        items: BILLING_EXAMPLES.invoice.detailItems,
      },
      message: 'Invoice line added',
    },
    requestType: AddInvoiceItemDto,
    requestExample: BILLING_EXAMPLES.invoice.addItemRequest,
    notFoundDescription: 'Invoice not found.',
  })
  async addInvoiceItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: AddInvoiceItemDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const invoice = await this.billingService.addInvoiceItem(id, payload, actor);

    return {
      data: invoice,
      message: 'Invoice line added',
    };
  }

  @Delete(':id/items/:itemId')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Remove a line from a draft invoice',
    responseDescription:
      'The DRAFT invoice without the line and with a recomputed total. Only DRAFT invoices can lose lines.',
    responseExample: {
      data: {
        ...BILLING_EXAMPLES.invoice.listItem,
        status: 'DRAFT',
        items: BILLING_EXAMPLES.invoice.detailItems,
      },
      message: 'Invoice line removed',
    },
    notFoundDescription: 'Invoice or invoice line not found.',
  })
  async removeInvoiceItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const invoice = await this.billingService.removeInvoiceItem(id, itemId, actor);

    return {
      data: invoice,
      message: 'Invoice line removed',
    };
  }

  @Post(':id/issue')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Issue a draft invoice',
    responseDescription:
      'The invoice is ISSUED — the document handed to the patient. From here it is corrected by voiding and reissuing, never edited.',
    responseExample: {
      data: {
        ...BILLING_EXAMPLES.invoice.listItem,
        items: BILLING_EXAMPLES.invoice.detailItems,
      },
      message: 'Invoice issued',
    },
    notFoundDescription: 'Invoice not found.',
  })
  async issueInvoice(@Param('id', new ParseUUIDPipe()) id: string) {
    const invoice = await this.billingService.issueInvoice(id);

    return {
      data: invoice,
      message: 'Invoice issued',
    };
  }

  @Post(':id/payment')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Payment' }])
  @ApiEndpoint({
    summary: 'Record the payment for an issued invoice',
    responseDescription:
      'The invoice is PAID. The amount must repeat the invoice total exactly — one full payment per invoice in v1.',
    responseExample: {
      data: {
        ...BILLING_EXAMPLES.invoice.listItem,
        status: 'PAID',
        items: BILLING_EXAMPLES.invoice.detailItems,
        payment: BILLING_EXAMPLES.invoice.payment,
      },
      message: 'Payment recorded',
    },
    requestType: RecordPaymentDto,
    requestExample: BILLING_EXAMPLES.invoice.paymentRequest,
    notFoundDescription: 'Invoice not found.',
  })
  async recordPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RecordPaymentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const invoice = await this.billingService.recordPayment(id, payload, actor);

    return {
      data: invoice,
      message: 'Payment recorded',
    };
  }

  @Post(':id/void')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Void an invoice',
    responseDescription:
      'The invoice is VOID with the given reason and an audit event, freeing the encounter for a corrected reissue. PAID invoices can not be voided in v1 — refunds are out of scope.',
    responseExample: {
      data: {
        ...BILLING_EXAMPLES.invoice.listItem,
        status: 'VOID',
        voidedAt: '2026-07-28T04:00:00.000Z',
        items: BILLING_EXAMPLES.invoice.detailItems,
      },
      message: 'Invoice voided',
    },
    requestType: VoidInvoiceDto,
    requestExample: BILLING_EXAMPLES.invoice.voidRequest,
    notFoundDescription: 'Invoice not found.',
  })
  async voidInvoice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: VoidInvoiceDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const invoice = await this.billingService.voidInvoice(id, payload, actor);

    return {
      data: invoice,
      message: 'Invoice voided',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
