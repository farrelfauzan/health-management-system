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

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
import { UpdatePatientDto } from '../dto/update-patient.dto';
import { PatientManagementService } from '../service/patient-management.service';

@ApiTags('Patient Management')
@Controller({
  version: '1',
  path: 'patients',
})
export class PatientManagementController {
  constructor(private readonly patientManagementService: PatientManagementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'List patients',
    responseDescription: 'A permission-scoped, paginated list of patients.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.patient.listItem],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listPatients(@Query() query: ListPatientsQueryDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.patientManagementService.listPatients(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Get a patient',
    responseDescription: 'The patient and active doctor relationships.',
    responseExample: { data: PHASE_THREE_EXAMPLES.patient.detail },
  })
  async getPatientById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const patient = await this.patientManagementService.getPatientById(id, currentUser);

    return {
      data: patient,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Create a patient',
    responseDescription: 'The patient and optional initial doctor assignments were created.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.patient.item,
      message: 'Patient created',
    },
    requestType: CreatePatientDto,
    requestExample: PHASE_THREE_EXAMPLES.patient.createRequest,
    successStatus: 201,
  })
  async createPatient(@Body() payload: CreatePatientDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const patient = await this.patientManagementService.createPatient(payload, currentUser);

    return {
      data: patient,
      message: 'Patient created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Update a patient',
    responseDescription: 'The patient was updated.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.patient.item,
      message: 'Patient updated',
    },
    requestType: UpdatePatientDto,
    requestExample: PHASE_THREE_EXAMPLES.patient.updateRequest,
  })
  async updatePatient(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdatePatientDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const patient = await this.patientManagementService.updatePatient(id, payload, currentUser);

    return {
      data: patient,
      message: 'Patient updated',
    };
  }
}
