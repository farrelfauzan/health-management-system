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
import { ADMISSION_FLOW_EXAMPLES } from '../../../common/openapi/admission-flow-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { AdmitPatientDto } from '../dto/admit-patient.dto';
import { CancelAdmissionDto } from '../dto/cancel-admission.dto';
import { DischargeAdmissionDto } from '../dto/discharge-admission.dto';
import { ListAdmissionsQueryDto } from '../dto/list-admissions-query.dto';
import { TransferAdmissionDto } from '../dto/transfer-admission.dto';
import { UpdateAdmissionDto } from '../dto/update-admission.dto';
import { AdmissionFlowService } from '../service/admission-flow.service';

@ApiTags('Admission Flow')
@RequireFeature('room-management')
@Controller({
  version: '1',
  path: 'admissions',
})
export class AdmissionFlowController {
  constructor(private readonly admissionFlowService: AdmissionFlowService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Admission' }])
  @Audited({ resource: 'admission', action: AuditAction.READ, idParam: null, patientIdQuery: 'patientId' })
  @ApiEndpoint({
    summary: 'List admissions',
    responseDescription:
      'A permission-scoped, paginated admission list. Under OWN scope it narrows to stays the caller admitted, owns, or is on the care team for.',
    responseExample: {
      data: [ADMISSION_FLOW_EXAMPLES.admission.listItem],
      meta: ADMISSION_FLOW_EXAMPLES.paginationMeta,
    },
  })
  async listAdmissions(
    @Query() query: ListAdmissionsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const result = await this.admissionFlowService.listAdmissions(
      query,
      this.requireUser(currentUser),
    );

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Admission' }])
  @Audited({ resource: 'admission', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Get an admission',
    responseDescription: 'One stay, with its full bed history oldest first.',
    responseExample: { data: ADMISSION_FLOW_EXAMPLES.admission.listItem },
    notFoundDescription: 'Admission not found.',
  })
  async getAdmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return { data: await this.admissionFlowService.getAdmission(id, this.requireUser(currentUser)) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'admit', subject: 'Admission' }])
  @Audited({ resource: 'admission', action: AuditAction.CREATE, idParam: null })
  @ApiEndpoint({
    summary: 'Admit a patient',
    responseDescription:
      'The stay was opened: an admission, its first bed assignment, the bed flipped to OCCUPIED and the patient to IN_PATIENT, all in one transaction. 409 when the bed is taken or the patient already has an open admission.',
    responseExample: {
      data: ADMISSION_FLOW_EXAMPLES.admission.listItem,
      message: 'Patient admitted',
    },
    requestType: AdmitPatientDto,
    requestExample: ADMISSION_FLOW_EXAMPLES.admission.admitRequest,
    successStatus: 201,
  })
  async admitPatient(@Body() payload: AdmitPatientDto, @AuthUser() currentUser?: CurrentUser) {
    const admission = await this.admissionFlowService.admitPatient(
      payload,
      this.requireUser(currentUser),
    );

    return {
      data: admission,
      message: 'Patient admitted',
    };
  }

  @Post(':id/transfer')
  @HttpCode(200)
  @Auth([{ action: 'transfer', subject: 'Admission' }])
  @Audited({ resource: 'admission', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Transfer an admitted patient to another bed',
    responseDescription:
      'The current bed assignment was closed and a new one opened, so the stay keeps its full bed history. 409 when the target bed is taken.',
    responseExample: {
      data: ADMISSION_FLOW_EXAMPLES.admission.listItem,
      message: 'Patient transferred',
    },
    requestType: TransferAdmissionDto,
    requestExample: ADMISSION_FLOW_EXAMPLES.admission.transferRequest,
    notFoundDescription: 'Admission not found.',
  })
  async transferAdmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: TransferAdmissionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const admission = await this.admissionFlowService.transferAdmission(
      id,
      payload,
      this.requireUser(currentUser),
    );

    return {
      data: admission,
      message: 'Patient transferred',
    };
  }

  @Post(':id/discharge')
  @HttpCode(200)
  @Auth([{ action: 'discharge', subject: 'Admission' }])
  @Audited({ resource: 'admission', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Discharge an admitted patient',
    responseDescription:
      'The bed assignment was closed, the bed freed, and the patient set to DISCHARGED. Terminal — a readmission is a new admission.',
    responseExample: {
      data: ADMISSION_FLOW_EXAMPLES.admission.listItem,
      message: 'Patient discharged',
    },
    requestType: DischargeAdmissionDto,
    requestExample: ADMISSION_FLOW_EXAMPLES.admission.dischargeRequest,
    notFoundDescription: 'Admission not found.',
  })
  async dischargeAdmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: DischargeAdmissionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const admission = await this.admissionFlowService.dischargeAdmission(
      id,
      payload,
      this.requireUser(currentUser),
    );

    return {
      data: admission,
      message: 'Patient discharged',
    };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth([{ action: 'cancel', subject: 'Admission' }])
  @Audited({ resource: 'admission', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Cancel an admission opened in error',
    responseDescription:
      'The stay was cancelled, the bed freed, and the patient returned to OUT_PATIENT — not DISCHARGED, which would put a discharge in the record for a stay the clinic is saying never happened.',
    responseExample: {
      data: ADMISSION_FLOW_EXAMPLES.admission.listItem,
      message: 'Admission cancelled',
    },
    requestType: CancelAdmissionDto,
    requestExample: ADMISSION_FLOW_EXAMPLES.admission.cancelRequest,
    notFoundDescription: 'Admission not found.',
  })
  async cancelAdmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: CancelAdmissionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const admission = await this.admissionFlowService.cancelAdmission(
      id,
      payload,
      this.requireUser(currentUser),
    );

    return {
      data: admission,
      message: 'Admission cancelled',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Admission' }])
  @Audited({ resource: 'admission', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Correct an open admission',
    responseDescription:
      'The reason for admission or the responsible clinician was corrected. A settled admission is never edited.',
    responseExample: {
      data: ADMISSION_FLOW_EXAMPLES.admission.listItem,
      message: 'Admission updated',
    },
    requestType: UpdateAdmissionDto,
    requestExample: ADMISSION_FLOW_EXAMPLES.admission.updateRequest,
    notFoundDescription: 'Admission not found.',
  })
  async updateAdmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateAdmissionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const admission = await this.admissionFlowService.updateAdmission(
      id,
      payload,
      this.requireUser(currentUser),
    );

    return {
      data: admission,
      message: 'Admission updated',
    };
  }

  private requireUser(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
