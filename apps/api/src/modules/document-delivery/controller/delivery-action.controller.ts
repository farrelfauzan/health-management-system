import {
  Controller,
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
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_DELIVERY_EXAMPLES } from '../../../common/openapi/document-delivery-examples';
import { InvoiceDeliveryService } from '../service/invoice-delivery.service';

const OK_STATUS = 200;

/**
 * The two things staff can do to a delivery after asking for it (`P16-T25`,
 * §7.4.9): queue a failed one again, or withdraw it. Addressed by delivery
 * id rather than under the invoice because the same rows will carry
 * clinical documents under `P16-T40`, and a retry is a retry whichever
 * document is inside.
 */
@ApiTags('Invoice Delivery')
@Controller({
  version: '1',
  path: 'deliveries',
})
export class DeliveryActionController {
  constructor(private readonly deliveryService: InvoiceDeliveryService) {}

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
