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
import { CreateAppointmentInput, createAppointmentSchema } from '@hms/shared-types';
import { ZodValidationPipe } from 'nestjs-zod';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { ApproveAppointmentDto } from '../dto/approve-appointment.dto';
import { CancelAppointmentDto } from '../dto/cancel-appointment.dto';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from '../dto/list-appointments-query.dto';
import { RejectAppointmentDto } from '../dto/reject-appointment.dto';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { AppointmentManagementService } from '../service/appointment-management.service';

@ApiTags('Appointment Management')
@Controller({
  version: '1',
  path: 'appointments',
})
export class AppointmentManagementController {
  constructor(private readonly appointmentManagementService: AppointmentManagementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Appointment' }])
  @ApiEndpoint({
    summary: 'List appointments',
    responseDescription: 'A permission-scoped, filtered, paginated appointment list.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.appointment.listItem],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
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
  @ApiEndpoint({
    summary: 'Get an appointment',
    responseDescription: 'The appointment visible to the authenticated actor.',
    responseExample: { data: PHASE_THREE_EXAMPLES.appointment.item },
  })
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
  @ApiEndpoint({
    summary: 'Create an appointment',
    responseDescription: 'The appointment was created after schedule validation.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.appointment.item,
      message: 'Appointment created',
    },
    requestType: CreateAppointmentDto,
    requestExample: PHASE_THREE_EXAMPLES.appointment.createRequest,
    successStatus: 201,
  })
  async createAppointment(
    @Body(new ZodValidationPipe(createAppointmentSchema)) payload: CreateAppointmentInput,
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
  @ApiEndpoint({
    summary: 'Update an appointment',
    responseDescription: 'The appointment was updated after transition and schedule validation.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.appointment.item,
      message: 'Appointment updated',
    },
    requestType: UpdateAppointmentDto,
    requestExample: PHASE_THREE_EXAMPLES.appointment.updateRequest,
  })
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

  @Post(':id/approve')
  @HttpCode(200)
  @Auth([{ action: 'approve', subject: 'Appointment' }])
  @ApiEndpoint({
    summary: 'Approve a special appointment request',
    responseDescription: 'The pending special request was approved and scheduled.',
    responseExample: {
      data: { ...PHASE_THREE_EXAMPLES.appointment.item, type: 'SPECIAL_REQUEST' },
      message: 'Appointment request approved',
    },
    requestType: ApproveAppointmentDto,
    requestExample: PHASE_THREE_EXAMPLES.appointment.approveRequest,
  })
  async approveAppointment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: ApproveAppointmentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const appointment = await this.appointmentManagementService.approveAppointment(
      id,
      payload,
      currentUser,
    );

    return {
      data: appointment,
      message: 'Appointment request approved',
    };
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Auth([{ action: 'approve', subject: 'Appointment' }])
  @ApiEndpoint({
    summary: 'Reject a special appointment request',
    responseDescription: 'The pending special request was rejected.',
    responseExample: {
      data: {
        ...PHASE_THREE_EXAMPLES.appointment.item,
        type: 'SPECIAL_REQUEST',
        status: 'REJECTED',
      },
      message: 'Appointment request rejected',
    },
    requestType: RejectAppointmentDto,
    requestExample: PHASE_THREE_EXAMPLES.appointment.rejectRequest,
  })
  async rejectAppointment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RejectAppointmentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const appointment = await this.appointmentManagementService.rejectAppointment(
      id,
      payload,
      currentUser,
    );

    return {
      data: appointment,
      message: 'Appointment request rejected',
    };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth([{ action: 'cancel', subject: 'Appointment' }])
  @ApiEndpoint({
    summary: 'Cancel an appointment',
    responseDescription: 'The appointment was transitioned to cancelled.',
    responseExample: {
      data: {
        ...PHASE_THREE_EXAMPLES.appointment.item,
        status: 'CANCELLED',
        reason: 'Patient requested cancellation',
      },
      message: 'Appointment cancelled',
    },
    requestType: CancelAppointmentDto,
    requestExample: PHASE_THREE_EXAMPLES.appointment.cancelRequest,
  })
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
