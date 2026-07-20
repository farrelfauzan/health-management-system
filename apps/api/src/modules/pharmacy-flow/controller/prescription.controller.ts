import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@ApiTags('Pharmacy Flow')
@Controller({
  version: '1',
  path: 'prescriptions',
})
export class PrescriptionController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Prescription' }])
  @ApiEndpoint({
    summary: 'Create a prescription',
    responseDescription: 'The prescription and its medication items were created.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.pharmacy.prescription,
      message: 'Prescription created',
    },
    requestType: CreatePrescriptionDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.prescriptionRequest,
    successStatus: 201,
  })
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
