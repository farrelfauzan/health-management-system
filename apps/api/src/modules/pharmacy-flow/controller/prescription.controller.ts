import { Body, Controller, Get, HttpCode, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { ListPrescriptionsQueryDto } from '../dto/list-prescriptions-query.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@ApiTags('Pharmacy Flow')
@Controller({
  version: '1',
  path: 'prescriptions',
})
export class PrescriptionController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Prescription' }])
  @Audited({
    resource: 'prescription',
    action: AuditAction.READ,
    idParam: null,
    patientIdQuery: 'patientId',
  })
  @ApiEndpoint({
    summary: 'List prescriptions',
    responseDescription: 'A permission-scoped, filtered, paginated prescription list.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.pharmacy.prescription],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listPrescriptions(
    @Query() query: ListPrescriptionsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.pharmacyFlowService.listPrescriptions(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Prescription' }])
  @Audited({ resource: 'prescription', action: AuditAction.CREATE })
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
