import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SESSION_CHANGE_EXAMPLES } from '../../../common/openapi/session-change-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CancelAppointmentSessionDto } from '../dto/cancel-appointment-session.dto';
import { MaterializeAppointmentSessionDto } from '../dto/materialize-appointment-session.dto';
import { RescheduleAppointmentSessionDto } from '../dto/reschedule-appointment-session.dto';
import { AppointmentSessionChangeService } from '../service/appointment-session-change.service';

/**
 * The admin's changes to one practice-session occurrence (P28): make a
 * projected occurrence real, cancel it with a reason, or move it within its
 * Monday–Sunday week. Admin-only; the service demands the `:any` grant.
 */
@ApiTags('Appointment Management')
@Controller({
  version: '1',
  path: 'appointment-sessions',
})
export class AppointmentSessionChangeController {
  constructor(private readonly appointmentSessionChangeService: AppointmentSessionChangeService) {}

  @Post('materialize')
  @HttpCode(200)
  @Auth([{ action: 'update', subject: 'AppointmentSession' }])
  @ApiEndpoint({
    summary: 'Materialise one occurrence of a weekly practice window',
    responseDescription:
      'The session row for that date — created if nobody has booked it yet, returned as it is otherwise — so it can be cancelled or moved.',
    responseExample: { data: SESSION_CHANGE_EXAMPLES.session },
    requestType: MaterializeAppointmentSessionDto,
    requestExample: SESSION_CHANGE_EXAMPLES.materializeRequest,
  })
  async materializeSession(
    @Body() payload: MaterializeAppointmentSessionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    const session = await this.appointmentSessionChangeService.materializeSession(
      payload,
      currentUser,
    );
    return { data: session };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth([{ action: 'update', subject: 'AppointmentSession' }])
  @Audited({ resource: 'appointment', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Cancel a practice session with a reason',
    responseDescription:
      'The session and every open booking in it were cancelled. Each patient with an account is notified with the reason.',
    responseExample: { data: SESSION_CHANGE_EXAMPLES.cancelResult, message: 'Session cancelled' },
    requestType: CancelAppointmentSessionDto,
    requestExample: SESSION_CHANGE_EXAMPLES.cancelRequest,
    notFoundDescription: 'Session not found.',
  })
  async cancelSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: CancelAppointmentSessionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    const result = await this.appointmentSessionChangeService.cancelSession(
      id,
      payload,
      currentUser,
    );
    return { data: result, message: 'Session cancelled' };
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  @Auth([{ action: 'update', subject: 'AppointmentSession' }])
  @Audited({ resource: 'appointment', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Move a practice session to another window in the same week',
    responseDescription:
      'The session moved to a new window in the same Monday–Sunday week; the original stays as MOVED. Bookings follow with their queue numbers. Moving to another day leaves registered patients and BPJS bookings in the original session, listed in `blocked` for the front desk. Patients who moved are notified.',
    responseExample: { data: SESSION_CHANGE_EXAMPLES.rescheduleResult, message: 'Session moved' },
    requestType: RescheduleAppointmentSessionDto,
    requestExample: SESSION_CHANGE_EXAMPLES.rescheduleRequest,
    notFoundDescription: 'Session not found.',
  })
  async rescheduleSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RescheduleAppointmentSessionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    const result = await this.appointmentSessionChangeService.rescheduleSession(
      id,
      payload,
      currentUser,
    );
    return { data: result, message: 'Session moved' };
  }
}
