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
import { CancelAppointmentDto } from '../dto/cancel-appointment.dto';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from '../dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { AppointmentManagementService } from '../service/appointment-management.service';

@Controller({
  version: '1',
  path: 'appointments',
})
export class AppointmentManagementController {
  constructor(private readonly appointmentManagementService: AppointmentManagementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Appointment' }])
  async listAppointments(
    @Query() query: ListAppointmentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.appointmentManagementService.listAppointments(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Appointment' }])
  async getAppointmentById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const appointment = await this.appointmentManagementService.getAppointmentById(
      id,
      currentUser,
    );

    return {
      data: appointment,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Appointment' }])
  async createAppointment(
    @Body() payload: CreateAppointmentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const appointment = await this.appointmentManagementService.createAppointment(
      payload,
      currentUser,
    );

    return {
      data: appointment,
      message: 'Appointment created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Appointment' }])
  async updateAppointment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateAppointmentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const appointment = await this.appointmentManagementService.updateAppointment(
      id,
      payload,
      currentUser,
    );

    return {
      data: appointment,
      message: 'Appointment updated',
    };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth([{ action: 'cancel', subject: 'Appointment' }])
  async cancelAppointment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: CancelAppointmentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const appointment = await this.appointmentManagementService.cancelAppointment(
      id,
      payload,
      currentUser,
    );

    return {
      data: appointment,
      message: 'Appointment cancelled',
    };
  }
}
