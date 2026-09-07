import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
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

  @Post(':id/document')
  @HttpCode(200)
  @Auth([{ action: 'read', subject: 'Prescription' }])
  // SJ-4: printing reads the patient's record, so the access row is written
  // whatever the business event says. `PRESCRIPTION_PRINTED` rides on top of
  // it, the way `INVOICE_VOIDED` does.
  @Audited({ resource: 'prescription-document', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Print the resep for a prescription',
    responseDescription:
      'Renders the prescription as the paper the patient carries to an apotek — the clinic’s own or an outside one — and files it as a clinical document on the visit. A compound prints under its compound name rather than its ingredients: the apotek dispenses the puyer, and listing six substances where the doctor wrote one preparation invites somebody to hand over six. Reprinting replaces the stored file rather than filing a second copy, and every print is audited. Printing is not a state change.',
    responseExample: { data: PHASE_THREE_EXAMPLES.pharmacy.prescriptionDocument },
    notFoundDescription: 'Prescription not found.',
  })
  async printPrescriptionDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return {
      data: await this.pharmacyFlowService.printPrescriptionDocument(id, currentUser),
    };
  }
}
