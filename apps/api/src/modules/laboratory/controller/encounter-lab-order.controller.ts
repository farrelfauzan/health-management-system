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

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreateLabOrderDto } from '../dto/create-lab-order.dto';
import { LabOrderService } from '../service/lab-order.service';

/**
 * Ordering happens inside a visit, so it hangs off the encounter — the same
 * shape diagnoses, procedures and immunisations already take. The order's own
 * routes (`/lab-orders/...`) are for everything that happens after the doctor
 * has walked away.
 */
@ApiTags('Laboratory Orders')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'encounters/:encounterId/lab-orders' })
export class EncounterLabOrderController {
  constructor(private readonly labOrderService: LabOrderService) {}

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-order', action: AuditAction.CREATE, idParam: 'encounterId' })
  @ApiEndpoint({
    summary: 'Order laboratory tests on an encounter',
    responseDescription:
      'One order with its panels expanded into items. Panels are expanded at order time, so a later edit to a panel never rewrites what was ordered — and billing still prices the panel once. Ordering is refused on an encounter that is not IN_PROGRESS, and a test already live on the visit comes back as a 409 naming the order it is already on.',
    responseExample: { data: LABORATORY_EXAMPLES.labOrder.view, message: 'Lab order created' },
    requestType: CreateLabOrderDto,
    requestExample: LABORATORY_EXAMPLES.labOrder.createRequest,
    successStatus: 201,
    notFoundDescription: 'Encounter not found, or a named test or panel is not orderable.',
  })
  async createLabOrder(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: CreateLabOrderDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labOrderService.createLabOrder(
        encounterId,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Lab order created',
    };
  }

  @Get()
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-order', action: AuditAction.READ, idParam: 'encounterId' })
  @ApiEndpoint({
    summary: 'List an encounter’s laboratory orders',
    responseDescription:
      'Every order raised on this visit, oldest first, with items and specimens. Under OWN scope the attending practitioner and the patient may read them.',
    responseExample: { data: [LABORATORY_EXAMPLES.labOrder.view] },
    notFoundDescription: 'Encounter not found.',
  })
  async listEncounterLabOrders(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labOrderService.listEncounterLabOrders(
        encounterId,
        this.assertAuthenticated(currentUser),
      ),
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
