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

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
import { UpdatePatientDto } from '../dto/update-patient.dto';
import { PatientManagementService } from '../service/patient-management.service';

@Controller({
  version: '1',
  path: 'patients',
})
export class PatientManagementController {
  constructor(private readonly patientManagementService: PatientManagementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Patient' }])
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
