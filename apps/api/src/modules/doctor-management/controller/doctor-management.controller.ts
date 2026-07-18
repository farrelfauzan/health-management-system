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
import { CreateDoctorDto } from '../dto/create-doctor.dto';
import { ListDoctorsQueryDto } from '../dto/list-doctors-query.dto';
import { UpdateDoctorScheduleDto } from '../dto/update-doctor-schedule.dto';
import { DoctorManagementService } from '../service/doctor-management.service';

@Controller({
  version: '1',
  path: 'doctors',
})
export class DoctorManagementController {
  constructor(private readonly doctorManagementService: DoctorManagementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Doctor' }])
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

  @Patch(':id/schedule')
  @Auth([{ action: 'write', subject: 'DoctorSchedule' }])
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
