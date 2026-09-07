import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { CancelLabOrderDto } from '../dto/cancel-lab-order.dto';
import { ListLabOrdersQueryDto } from '../dto/list-lab-orders-query.dto';
import { UpdateLabOrderDispositionDto } from '../dto/update-lab-order-disposition.dto';
import { LabOrderService } from '../service/lab-order.service';

/**
 * Lab orders addressed by their own id — the clinic-wide list the front desk
 * and the bench work from, one order in full, and withdrawal.
 */
@ApiTags('Laboratory Orders')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'lab-orders' })
export class LabOrderController {
  constructor(private readonly labOrderService: LabOrderService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-order', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List laboratory orders',
    responseDescription:
      'Newest first, filtered by status, patient and clinic-day range. Behind `lab-order.read:any` — a doctor’s own orders come back on the encounter route.',
    responseExample: {
      data: [LABORATORY_EXAMPLES.labOrder.listItem],
      meta: { page: 1, limit: 20, total: 1 },
    },
  })
  async listLabOrders(@Query() query: ListLabOrdersQueryDto) {
    return this.labOrderService.listLabOrders(query);
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-order', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Read one laboratory order',
    responseDescription: 'The order with its expanded items and every specimen drawn for it.',
    responseExample: { data: LABORATORY_EXAMPLES.labOrder.view },
    notFoundDescription: 'Lab order not found.',
  })
  async getLabOrderById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return { data: await this.labOrderService.getLabOrderById(id, this.assertAuthenticated(currentUser)) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-order', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Cancel a laboratory order',
    responseDescription:
      'The order is withdrawn with its reason and its pending items go with it. Only ORDERED and COLLECTED orders can be cancelled — once a result exists the order is history. `meta.requiresManualCredit` is true when the visit’s invoice has already been issued: an issued bill is corrected by voiding and reissuing, which is not the laboratory’s to do.',
    responseExample: {
      data: { ...LABORATORY_EXAMPLES.labOrder.view, status: 'CANCELLED' },
      meta: { requiresManualCredit: false },
      message: 'Lab order cancelled',
    },
    requestType: CancelLabOrderDto,
    requestExample: LABORATORY_EXAMPLES.labOrder.cancelRequest,
    notFoundDescription: 'Lab order not found.',
  })
  async cancelLabOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: CancelLabOrderDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const cancelled = await this.labOrderService.cancelLabOrder(
      id,
      payload,
      this.assertAuthenticated(currentUser),
    );

    return {
      data: cancelled.order,
      meta: cancelled.meta,
      message: 'Lab order cancelled',
    };
  }

  @Patch(':id/disposition')
  @Auth([{ action: 'write', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-order', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Change where a laboratory order is filled and who pays',
    responseDescription:
      'Moves the order between “we run it” and “an outside lab runs it”, and between “we bill it” and “somebody else does”. Usually called after the doctor has finished — the patient reaches the counter, hears the price, and chooses the lab their insurer uses. An EXTERNAL order leaves the worklist and stops producing an invoice line; the bill still names it, so the omission is explained. Only an ORDERED order can move: once a tube is drawn the clinic did the work.',
    responseExample: {
      data: {
        ...LABORATORY_EXAMPLES.labOrder.view,
        fulfilmentSite: 'EXTERNAL',
        chargeMode: 'EXTERNAL',
        externalFacilityName: 'Laboratorium Prodia Kemang',
      },
      message: 'Lab order disposition updated',
    },
    requestType: UpdateLabOrderDispositionDto,
    requestExample: LABORATORY_EXAMPLES.labOrder.dispositionRequest,
    notFoundDescription: 'Lab order not found.',
  })
  async updateDisposition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateLabOrderDispositionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labOrderService.updateDisposition(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Lab order disposition updated',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
