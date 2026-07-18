import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { CreateDoctorPatientAssignmentDto } from '../dto/create-doctor-patient-assignment.dto';
import { ListDoctorPatientActivityQueryDto } from '../dto/list-doctor-patient-activity-query.dto';
import { DoctorPatientService } from '../service/doctor-patient.service';

@Controller({
  version: '1',
  path: 'doctor-patient-assignments',
})
export class DoctorPatientController {
  constructor(private readonly doctorPatientService: DoctorPatientService) {}

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'assign', subject: 'DoctorPatient' }])
  async assignDoctorToPatient(
    @Body() payload: CreateDoctorPatientAssignmentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.doctorPatientService.assignDoctorToPatient(payload, currentUser);

    return {
      data: result.assignment,
      message: result.created ? 'Doctor assigned to patient' : 'Doctor already assigned to patient',
    };
  }

  @Get('activity')
  @Auth([{ action: 'read', subject: 'DoctorPatientActivity' }])
  async listActivity(
    @Query() query: ListDoctorPatientActivityQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.doctorPatientService.listActivity(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Delete(':id')
  @Auth([{ action: 'unassign', subject: 'DoctorPatient' }])
  async unassignDoctorFromPatient(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.doctorPatientService.unassignDoctorFromPatient(id, currentUser);

    return {
      data: result.assignment,
      message: result.unassigned
        ? 'Doctor unassigned from patient'
        : 'Assignment already unassigned',
    };
  }
}
