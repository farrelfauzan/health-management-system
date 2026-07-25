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
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreateDoctorPatientAssignmentDto } from '../dto/create-doctor-patient-assignment.dto';
import { ListDoctorPatientActivityQueryDto } from '../dto/list-doctor-patient-activity-query.dto';
import { DoctorPatientService } from '../service/doctor-patient.service';

@ApiTags('Doctor Patient')
@Controller({
  version: '1',
  path: 'doctor-patient-assignments',
})
export class DoctorPatientController {
  constructor(private readonly doctorPatientService: DoctorPatientService) {}

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'assign', subject: 'DoctorPatient' }])
  @ApiEndpoint({
    summary: 'Assign a doctor to a patient',
    responseDescription: 'The active assignment. Repeated requests are idempotent.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.assignment.item,
      message: 'Doctor assigned to patient',
    },
    requestType: CreateDoctorPatientAssignmentDto,
    requestExample: PHASE_THREE_EXAMPLES.assignment.createRequest,
    successStatus: 201,
  })
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
  @ApiEndpoint({
    summary: 'List doctor-patient assignment activity',
    responseDescription: 'A filtered, paginated, append-only activity log.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.assignment.activity],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
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
  @ApiEndpoint({
    summary: 'Unassign a doctor from a patient',
    responseDescription: 'The audited assignment state. Repeated requests are idempotent.',
    responseExample: {
      data: {
        ...PHASE_THREE_EXAMPLES.assignment.item,
        unassignedById: '33333333-3333-4333-8333-333333333333',
        unassignedAt: '2026-07-20T08:00:00.000Z',
      },
      message: 'Doctor unassigned from patient',
    },
    notFoundDescription: 'Assignment not found.',
  })
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
