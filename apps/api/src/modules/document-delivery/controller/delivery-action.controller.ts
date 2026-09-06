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
import { RescheduleDeliveryDto } from '../dto/reschedule-delivery.dto';
import { InvoiceDeliveryService } from '../service/invoice-delivery.service';

const OK_STATUS = 200;

/**
 * What staff can do to a delivery after asking for it: read where it stands
 * (`P16-T26`), queue a failed one again or withdraw it (`P16-T25`, §7.4.9),
 * and — while it is still waiting — call it off or move it (`P16-T38`).
 * Addressed by delivery id rather than under the invoice because the same
 * rows will carry clinical documents under `P16-T40`, and a retry is a retry
 * whichever document is inside.
 */
@ApiTags('Invoice Delivery')
@RequireFeature('invoice-delivery')
@Controller({
  version: '1',
  path: 'deliveries',
})
export class DeliveryActionController {
  constructor(private readonly deliveryService: InvoiceDeliveryService) {}

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Read one delivery',
    responseDescription:
      'Where the delivery stands: status, attempts, the last error, when it was sent or opened, and — on a link — the token’s expiry and open count. Poll this after a send to watch QUEUED become SENT.',
    responseExample: { data: DOCUMENT_DELIVERY_EXAMPLES.queuedDelivery },
    notFoundDescription: 'The delivery does not exist.',
  })
  async getDelivery(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.deliveryService.getDelivery(id) };
  }

  @Post(':id/cancel')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'deliver', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Call off a delivery that has not been sent yet',
    responseDescription:
      'The delivery marked CANCELLED. Only a QUEUED delivery — scheduled or not — can be cancelled (FR-E4-09); 409 `DELIVERY_NOT_SCHEDULABLE` once it has gone out or settled. Revoke is the act for a link that is already out.',
    responseExample: {
      data: DOCUMENT_DELIVERY_EXAMPLES.cancelledDelivery,
      message: 'Delivery cancelled',
    },
    notFoundDescription: 'The delivery does not exist.',
  })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.deliveryService.cancelDelivery(id, actor);
    return { data, message: 'Delivery cancelled' };
  }

  @Post(':id/reschedule')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'deliver', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Move a queued delivery to another time',
    responseDescription:
      'The delivery with its new `sendAt`. Only a QUEUED delivery that no worker has claimed can be moved; 409 `DELIVERY_NOT_SCHEDULABLE` otherwise, 422 `DELIVERY_SEND_AT_IN_PAST` for a time that is not ahead of now. Consent, the number and the invoice are re-checked when it fires, not now (FR-E4-10).',
    responseExample: {
      data: DOCUMENT_DELIVERY_EXAMPLES.scheduledDelivery,
      message: 'Delivery rescheduled',
    },
    requestType: RescheduleDeliveryDto,
    requestExample: DOCUMENT_DELIVERY_EXAMPLES.rescheduleRequest,
    notFoundDescription: 'The delivery does not exist.',
  })
  async reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: RescheduleDeliveryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.deliveryService.rescheduleDelivery(id, payload, actor);
    return { data, message: 'Delivery rescheduled' };
  }

  @Post(':id/retry')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'deliver', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Queue a failed delivery again',
    responseDescription:
      'The delivery back in QUEUED with its backoff cleared; the worker picks it up on its next sweep and re-checks consent and invoice state then. 409 `DELIVERY_NOT_RETRYABLE` unless the delivery is FAILED — a delivered invoice is resent with a new request, not a retry.',
    responseExample: {
      data: DOCUMENT_DELIVERY_EXAMPLES.queuedDelivery,
      message: 'Delivery queued again',
    },
    notFoundDescription: 'The delivery does not exist.',
  })
  async retry(@Param('id', ParseUUIDPipe) id: string, @AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.deliveryService.retryDelivery(id, actor);
    return { data, message: 'Delivery queued again' };
  }

  @Post(':id/revoke')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'deliver', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Withdraw a delivery, or kill its link',
    responseDescription:
      'The delivery marked REVOKED. Before it is sent, any delivery can be withdrawn; after, only a link delivery — its token stops resolving within seconds (FR-E4-11). 409 `DELIVERY_NOT_REVOCABLE` for an attachment that has already gone out: it is in the chat, and the timeline will not pretend otherwise.',
    responseExample: {
      data: DOCUMENT_DELIVERY_EXAMPLES.revokedDelivery,
      message: 'Delivery revoked',
    },
    notFoundDescription: 'The delivery does not exist.',
  })
  async revoke(@Param('id', ParseUUIDPipe) id: string, @AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.deliveryService.revokeDelivery(id, actor);
    return { data, message: 'Delivery revoked' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
