import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { CreateDispenseDto } from '../dto/create-dispense.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@Controller({
  version: '1',
  path: 'dispenses',
})
export class DispenseController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'DispenseRecord' }])
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
