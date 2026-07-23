import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { ListDoctorSessionsQueryDto } from '../dto/list-doctor-sessions-query.dto';
import { UpdateAppointmentSessionDto } from '../dto/update-appointment-session.dto';
import { AppointmentManagementService } from '../service/appointment-management.service';

@ApiTags('Appointment Management')
@Controller({
  version: '1',
})
export class AppointmentSessionController {
  constructor(private readonly appointmentManagementService: AppointmentManagementService) {}

  @Get('doctors/:doctorId/sessions')
  @Auth([{ action: 'read', subject: 'AppointmentSession' }])
  @ApiEndpoint({
    summary: 'List bookable sessions for a doctor',
    responseDescription:
      'Sessions projected from the weekly schedule over the date range, with booked counts and remaining capacity.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.appointment.session] },
  })
  async listDoctorSessions(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Query() query: ListDoctorSessionsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const sessions = await this.appointmentManagementService.listDoctorSessions(
      doctorId,
      query,
      currentUser,
    );

    return {
      data: sessions,
    };
  }

  @Get('appointment-sessions')
  @Auth([{ action: 'read', subject: 'AppointmentSession' }])
  @ApiEndpoint({
    summary: 'List sessions across all doctors',
    responseDescription:
      'Sessions for every active doctor over the date range, with doctor info and booked counts, for calendar display.',
    responseExample: {
      data: [
        {
          ...PHASE_THREE_EXAMPLES.appointment.session,
          doctor: PHASE_THREE_EXAMPLES.appointment.listItem.doctor,
        },
      ],
    },
  })
  async listSessionsCalendar(
    @Query() query: ListDoctorSessionsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const sessions = await this.appointmentManagementService.listSessionsCalendar(
      query,
      currentUser,
    );

    return {
      data: sessions,
    };
  }

  @Get('appointment-sessions/:id/queue')
  @Auth([{ action: 'read', subject: 'AppointmentSession' }])
  @ApiEndpoint({
    summary: 'Get the patient queue for a session',
    responseDescription: 'The session details and its booked patients in queue order.',
    responseExample: { data: PHASE_THREE_EXAMPLES.appointment.sessionQueue },
  })
  async getSessionQueue(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.appointmentManagementService.getSessionQueue(id, currentUser);

    return {
      data: result,
    };
  }

  @Patch('appointment-sessions/:id')
  @Auth([{ action: 'update', subject: 'AppointmentSession' }])
  @ApiEndpoint({
    summary: 'Update a session',
    responseDescription:
      'The session capacity or status was updated; cancelling a session cancels its open bookings.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.appointment.session,
      message: 'Session updated',
    },
    requestType: UpdateAppointmentSessionDto,
    requestExample: PHASE_THREE_EXAMPLES.appointment.sessionUpdateRequest,
  })
  async updateSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateAppointmentSessionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const session = await this.appointmentManagementService.updateSession(
      id,
      payload,
      currentUser,
    );

    return {
      data: session,
      message: 'Session updated',
    };
  }
}
