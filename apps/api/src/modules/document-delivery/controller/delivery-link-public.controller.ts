import { Controller, Get, Ip, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_DELIVERY_EXAMPLES } from '../../../common/openapi/document-delivery-examples';
import { DeliveryLinkService } from '../service/delivery-link.service';

/**
 * The only unauthenticated surface in PRD §7.4 (`P16-T25`, §7.4.9).
 *
 * The patient arrives here from `<web>/inv/<token>` — a page that renders
 * the clinic's explanation on failure and hands the browser the presigned
 * URL on success. The token is the whole credential: 256 bits from the
 * CSPRNG, stored only as a hash, dead after `DELIVERY_LINK_TTL_DAYS` or a
 * revoke. Every failure is the same 404, so the route confirms nothing about
 * whether an invoice exists; both counters are per minute, so neither a scan
 * of the token space nor a loop on one leaked link gets far.
 *
 * Not audited at the route: there is no actor to attribute. The service
 * writes the `DELIVERY_OPENED` row against the patient and the address.
 */
@ApiTags('Invoice Delivery')
@Controller({
  version: '1',
  path: 'delivery-links',
})
export class DeliveryLinkPublicController {
  constructor(private readonly deliveryLinkService: DeliveryLinkService) {}

  @Get(':token')
  @PublicRoute()
  @ApiEndpoint({
    summary: 'Open a delivery link',
    responseDescription:
      'A presigned GET for the PDF with attachment disposition, valid for minutes, and the file name to save it as. The open is counted on the delivery. 404 `DELIVERY_LINK_UNAVAILABLE` — identically — for a token that is unknown, expired, revoked, whose message never went out, or whose invoice was voided. 429 `RATE_LIMITED` after 60 opens a minute from one address or 10 of one token.',
    responseExample: { data: DOCUMENT_DELIVERY_EXAMPLES.linkResolution },
    isPublic: true,
    notFoundDescription:
      'The link is no longer valid. The page tells the patient to contact the clinic.',
  })
  async resolveLink(@Param('token') token: string, @Ip() requestIp: string) {
    return { data: await this.deliveryLinkService.resolve({ token, requestIp }) };
  }
}
