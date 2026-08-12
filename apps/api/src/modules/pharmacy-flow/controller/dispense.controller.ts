import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreateDispenseDto } from '../dto/create-dispense.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@ApiTags('Pharmacy Flow')
@Controller({
  version: '1',
  path: 'dispenses',
})
export class DispenseController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'DispenseRecord' }])
  @Audited({ resource: 'dispense', action: AuditAction.CREATE })
  @ApiEndpoint({
    summary: 'Dispense a prescription',
    responseDescription: 'The dispense record was committed and inventory was reduced atomically.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.pharmacy.dispense,
      message: 'Dispense recorded',
    },
    requestType: CreateDispenseDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.dispenseRequest,
    successStatus: 201,
  })
  async createDispense(
    @Body() payload: CreateDispenseDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const dispenseRecord = await this.pharmacyFlowService.createDispense(payload, currentUser);

    return {
      data: dispenseRecord,
      message: 'Dispense recorded',
    };
  }
}
