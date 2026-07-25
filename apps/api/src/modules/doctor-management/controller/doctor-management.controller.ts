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
import { CreateDoctorDto } from '../dto/create-doctor.dto';
import { ListDoctorsQueryDto } from '../dto/list-doctors-query.dto';
import { UpdateDoctorDto } from '../dto/update-doctor.dto';
import { UpdateDoctorScheduleDto } from '../dto/update-doctor-schedule.dto';
import { DoctorManagementService } from '../service/doctor-management.service';

@ApiTags('Doctor Management')
@Controller({
  version: '1',
  path: 'doctors',
})
export class DoctorManagementController {
  constructor(private readonly doctorManagementService: DoctorManagementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'List doctors',
    responseDescription: 'A paginated list of doctors.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.doctor.listItem],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listDoctors(@Query() query: ListDoctorsQueryDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.doctorManagementService.listDoctors(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'Get a doctor',
    responseDescription: 'The doctor, schedule, and permitted patient relationships.',
    responseExample: { data: PHASE_THREE_EXAMPLES.doctor.detail },
    notFoundDescription: 'Doctor not found.',
  })
  async getDoctorById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const doctor = await this.doctorManagementService.getDoctorById(id, currentUser);

    return {
      data: doctor,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'Create a doctor',
    responseDescription: 'The doctor and optional initial patient assignments were created.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.doctor.item,
      message: 'Doctor created',
    },
    requestType: CreateDoctorDto,
    requestExample: PHASE_THREE_EXAMPLES.doctor.createRequest,
    successStatus: 201,
  })
  async createDoctor(@Body() payload: CreateDoctorDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const doctor = await this.doctorManagementService.createDoctor(payload, currentUser);

    return {
      data: doctor,
      message: 'Doctor created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'Update a doctor',
    responseDescription: 'The doctor profile was updated.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.doctor.item,
      message: 'Doctor updated',
    },
    requestType: UpdateDoctorDto,
    requestExample: PHASE_THREE_EXAMPLES.doctor.updateRequest,
    notFoundDescription: 'Doctor not found.',
  })
  async updateDoctor(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateDoctorDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const doctor = await this.doctorManagementService.updateDoctor(id, payload, currentUser);

    return {
      data: doctor,
      message: 'Doctor updated',
    };
  }

  @Patch(':id/schedule')
  @Auth([{ action: 'write', subject: 'DoctorSchedule' }])
  @ApiEndpoint({
    summary: 'Replace a doctor schedule',
    responseDescription: 'The validated non-overlapping schedule was saved.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.doctor.detail.schedules,
      message: 'Doctor schedule updated',
    },
    requestType: UpdateDoctorScheduleDto,
    requestExample: PHASE_THREE_EXAMPLES.doctor.scheduleRequest,
    notFoundDescription: 'Doctor not found.',
  })
  async updateDoctorSchedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateDoctorScheduleDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const schedules = await this.doctorManagementService.updateDoctorSchedule(
      id,
      payload,
      currentUser,
    );

    return {
      data: schedules,
      message: 'Doctor schedule updated',
    };
  }
}
