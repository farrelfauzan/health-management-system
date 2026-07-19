import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@Controller({
  version: '1',
  path: 'prescriptions',
})
export class PrescriptionController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Prescription' }])
  async createPrescription(
    @Body() payload: CreatePrescriptionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const prescription = await this.pharmacyFlowService.createPrescription(payload, currentUser);

    return {
      data: prescription,
      message: 'Prescription created',
    };
  }
}
