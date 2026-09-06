import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_DELIVERY_EXAMPLES } from '../../../common/openapi/document-delivery-examples';
import { RequestInvoiceDeliveryDto } from '../dto/request-invoice-delivery.dto';
import { InvoiceDeliveryService } from '../service/invoice-delivery.service';

const CREATED_STATUS = 201;

/**
 * Sending an invoice and reading what was sent (`P16-T25`, §7.4.9).
 *
 * `invoice.deliver:any` is its own key, separate from `invoice.write:any`:
 * issuing a bill and transmitting a patient's charges outside the building
 * are different acts, and a clinic that wants a junior cashier to do the
 * first but not the second can say so without a code change (§7.4.10).
 * Reading the timeline needs only `invoice.read:any` — it is part of the
 * invoice.
 */
@ApiTags('Invoice Delivery')
@RequireFeature('invoice-delivery')
@Controller({
  version: '1',
  path: 'invoices/:invoiceId/deliveries',
})
export class InvoiceDeliveryController {
  constructor(private readonly deliveryService: InvoiceDeliveryService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: "Read an invoice's delivery timeline",
    responseDescription:
      'Every delivery ever requested for this invoice, newest first: channel, shape, masked destination, status, attempts, the last error if any, who asked, and — on a link delivery — the token’s expiry, revocation and open count. Never the destination and never the token.',
    responseExample: { data: DOCUMENT_DELIVERY_EXAMPLES.timeline },
    notFoundDescription: 'The invoice does not exist.',
  })
  async listDeliveries(@Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return { data: await this.deliveryService.listInvoiceDeliveries(invoiceId) };
  }

  @Post()
  @HttpCode(CREATED_STATUS)
  @Auth([{ action: 'deliver', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Send the rendered invoice to the patient',
    responseDescription:
      'One QUEUED delivery per requested channel; the worker sends them. Refused as a whole with 409 unless the invoice is ISSUED or PAID and its document is READY (FR-E4-02); with 422 `DELIVERY_CHANNEL_REFUSED` naming the channel and reason when consent or the verified-number gate says no (FR-E4-03/04); and with 422 `DELIVERY_PASSWORD_SOURCE_MISSING` when an attachment could not be locked because the patient has no date of birth on file (FR-E4-07). Resending is a normal act: a second request adds a second row. A future `sendAt` parks the rows until then (FR-E4-09); 422 `DELIVERY_SEND_AT_IN_PAST` otherwise.',
    responseExample: {
      data: DOCUMENT_DELIVERY_EXAMPLES.timeline,
      message: 'Delivery queued',
    },
    requestType: RequestInvoiceDeliveryDto,
    requestExample: DOCUMENT_DELIVERY_EXAMPLES.sendRequest,
    successStatus: CREATED_STATUS,
    notFoundDescription: 'The invoice does not exist.',
  })
  async requestDelivery(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() payload: RequestInvoiceDeliveryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.deliveryService.requestInvoiceDelivery(invoiceId, payload, actor);
    return { data, message: 'Delivery queued' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
