import {
  Actor,
  AppointmentSessionCancelResult,
  AppointmentSessionRescheduleResult,
  AppointmentSessionResponse,
  MaterializedSessionRecord,
  NotificationTypeValue,
  SessionTargetDayWindows,
  buildZonedDateTime,
  doSessionWindowsOverlap,
  getDayOfWeekForDate,
  isSameCalendarWeek,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { NotificationService } from '../../notification/service/notification.service';
import { CancelAppointmentSessionDto } from '../dto/cancel-appointment-session.dto';
import { MaterializeAppointmentSessionDto } from '../dto/materialize-appointment-session.dto';
import { RescheduleAppointmentSessionDto } from '../dto/reschedule-appointment-session.dto';
import { AppointmentManagementRepository } from '../repository/appointment-management.repository';
import { AppointmentSessionChangeRepository } from '../repository/appointment-session-change.repository';
import { resolveAppointmentSubject } from './resolve-appointment-subject';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const LIVE_SESSION_STATUSES = ['OPEN', 'CLOSED'];
const ADMIN_ACTOR_SCOPE = { userId: 'session-change-admin', scope: 'ANY' } as const;

/**
 * An admin's changes to one practice-session occurrence (P28, PO decisions of
 * 2026-09-23): cancel it with a reason, or move it to another window in the
 * same Monday–Sunday week. Admin-only — the doctor arranges it with the admin
 * privately — so every entry point demands `appointment.session.update:any`.
 *
 * Patients are told after the transaction commits, never inside it: a
 * notification failure must not undo a move the admin already saw succeed.
 */
@Injectable()
export class AppointmentSessionChangeService {
  private readonly logger = new Logger(AppointmentSessionChangeService.name);
  private readonly clinicTimeZone: string;

  constructor(
    private readonly appointmentManagementRepository: AppointmentManagementRepository,
    private readonly appointmentSessionChangeRepository: AppointmentSessionChangeRepository,
    private readonly authRepository: AuthRepository,
    private readonly notificationService: NotificationService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * Makes one occurrence of a weekly window real so it can be cancelled or
   * moved before anybody has booked it (P28-T02).
   */
  async materializeSession(
    payload: MaterializeAppointmentSessionDto,
    currentUser: CurrentUser,
  ): Promise<AppointmentSessionResponse> {
    await this.assertCanChangeSessions(currentUser);
    const window = await this.appointmentManagementRepository.findScheduleWindowById(
      payload.scheduleId,
    );
    if (!window || !window.isAvailable) {
      throw new BadRequestException('Schedule window not found');
    }
    if (getDayOfWeekForDate(payload.sessionDate) !== window.dayOfWeek) {
      throw new BadRequestException('sessionDate does not fall on the schedule day');
    }
    const session = await this.appointmentSessionChangeRepository.materializeSession({
      doctorId: window.doctorId,
      scheduleId: window.id,
      sessionDate: payload.sessionDate,
      startTime: window.startTime,
      endTime: window.endTime,
      maxPatients: window.maxPatients,
    });
    return this.toSessionResponse(session);
  }

  /**
   * Cancels the session and its open bookings, and tells each patient why
   * (P28-T02).
   */
  async cancelSession(
    sessionId: string,
    payload: CancelAppointmentSessionDto,
    currentUser: CurrentUser,
  ): Promise<AppointmentSessionCancelResult> {
    await this.assertCanChangeSessions(currentUser);
    const source = await this.findSessionOrThrow(sessionId);
    const result = await this.appointmentSessionChangeRepository.cancelSession({
      sessionId,
      reason: payload.reason,
      actorUserId: currentUser.sub,
    });
    if (result.outcome === 'NOT_CANCELLABLE') {
      throw new ConflictException('Only an open or closed session can be cancelled');
    }
    await this.notifyPatients({
      recipientUserIds: result.cancelled.map((booking) => booking.recipientUserId),
      type: 'APPOINTMENT_SESSION_CANCELLED',
      messageKey: 'appointmentSessionCancelled',
      params: {
        doctorName: result.doctorName,
        sessionDate: this.toDateString(source.sessionDate),
        startTime: source.startTime,
        endTime: source.endTime,
        reason: payload.reason,
      },
    });
    return {
      session: this.toSessionResponse(await this.findSessionOrThrow(sessionId)),
      cancelledCount: result.cancelled.length,
    };
  }

  /**
   * Moves one occurrence to another window in the same Monday–Sunday week
   * (P28-T04). Allowed even after the session has started — the doctor who
   * arrives late — as long as the new window is not already over.
   */
  async rescheduleSession(
    sessionId: string,
    payload: RescheduleAppointmentSessionDto,
    currentUser: CurrentUser,
  ): Promise<AppointmentSessionRescheduleResult> {
    await this.assertCanChangeSessions(currentUser);
    const source = await this.findSessionOrThrow(sessionId);
    const sourceDate = this.toDateString(source.sessionDate);
    this.assertMoveTimingAllowed({ source, sourceDate, payload });
    await this.assertNoClash({ source, payload });
    const result = await this.appointmentSessionChangeRepository.moveSession({
      sourceSessionId: sessionId,
      targetSessionDate: payload.sessionDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      maxPatients: payload.maxPatients,
      scheduledAt: this.buildInstant(payload.sessionDate, payload.startTime),
      isSameDay: payload.sessionDate === sourceDate,
      reason: payload.reason,
      actorUserId: currentUser.sub,
    });
    if (result.outcome === 'SOURCE_NOT_MOVABLE') {
      throw new ConflictException('Only an open or closed session can be moved');
    }
    if (result.outcome === 'TARGET_START_TAKEN') {
      throw new ConflictException(
        `The doctor already has a session record starting at ${payload.startTime} on ${payload.sessionDate}; choose another start time`,
      );
    }
    if (result.outcome === 'CAPACITY_SHORTFALL') {
      throw new ConflictException(
        `${result.movableCount} patients will move but the new session only holds ${result.maxPatients}; raise the capacity`,
      );
    }
    await this.notifyPatients({
      recipientUserIds: result.moved.map((booking) => booking.recipientUserId),
      type: 'APPOINTMENT_RESCHEDULED',
      messageKey: 'appointmentRescheduled',
      params: {
        doctorName: result.doctorName,
        sessionDate: payload.sessionDate,
        startTime: payload.startTime,
        endTime: payload.endTime,
        reason: payload.reason,
      },
    });
    return {
      source: this.toSessionResponse(await this.findSessionOrThrow(sessionId)),
      target: this.toSessionResponse(await this.findSessionOrThrow(result.targetSessionId)),
      movedCount: result.moved.length,
      blocked: result.blocked.map((entry) => ({
        appointmentId: entry.appointmentId,
        reason: entry.reason,
        subject: resolveAppointmentSubject(entry),
      })),
    };
  }

  private assertMoveTimingAllowed(params: {
    source: MaterializedSessionRecord;
    sourceDate: string;
    payload: RescheduleAppointmentSessionDto;
  }): void {
    const { source, sourceDate, payload } = params;
    if (!LIVE_SESSION_STATUSES.includes(source.status)) {
      throw new ConflictException('Only an open or closed session can be moved');
    }
    if (!isSameCalendarWeek(sourceDate, payload.sessionDate)) {
      throw new BadRequestException(
        'A session can only be moved within its own week, Monday to Sunday',
      );
    }
    if (payload.sessionDate === sourceDate && payload.startTime === source.startTime) {
      throw new BadRequestException('The new start time is the same as the current one');
    }
    if (this.buildInstant(payload.sessionDate, payload.endTime).getTime() <= Date.now()) {
      throw new BadRequestException('The new session window is already over');
    }
  }

  /**
   * Refuses a window that overlaps the doctor's other sessions that day — or
   * a weekly window on that weekday nobody has booked yet, which has no row
   * for the unique key to catch. A cancelled or moved row still occupies its
   * start time as a tombstone, so it hides its weekly window but clashes with
   * nothing.
   */
  private async assertNoClash(params: {
    source: MaterializedSessionRecord;
    payload: RescheduleAppointmentSessionDto;
  }): Promise<void> {
    const { source, payload } = params;
    const windows = await this.appointmentSessionChangeRepository.findTargetDayWindows({
      doctorId: source.doctorId,
      sessionDate: payload.sessionDate,
      dayOfWeek: getDayOfWeekForDate(payload.sessionDate),
    });
    const clash = this.findClashingWindow({ windows, sourceId: source.id, payload });
    if (clash) {
      throw new ConflictException(
        `The new window overlaps the doctor's ${clash.startTime}–${clash.endTime} session on ${payload.sessionDate}`,
      );
    }
  }

  private findClashingWindow(params: {
    windows: SessionTargetDayWindows;
    sourceId: string;
    payload: RescheduleAppointmentSessionDto;
  }): { startTime: string; endTime: string } | undefined {
    const { windows, sourceId, payload } = params;
    const occupiedStarts = new Set(windows.sessions.map((session) => session.startTime));
    const liveSessions = windows.sessions.filter(
      (session) => session.id !== sourceId && LIVE_SESSION_STATUSES.includes(session.status),
    );
    const unbookedWindows = windows.schedules.filter(
      (schedule) => !occupiedStarts.has(schedule.startTime),
    );
    return [...liveSessions, ...unbookedWindows].find((window) =>
      doSessionWindowsOverlap(window, payload),
    );
  }

  private async notifyPatients(params: {
    recipientUserIds: Array<string | null>;
    type: NotificationTypeValue;
    messageKey: string;
    params: Record<string, string>;
  }): Promise<void> {
    const userIds = [...new Set(params.recipientUserIds.filter((id): id is string => id !== null))];
    if (userIds.length === 0) {
      return;
    }
    try {
      await this.notificationService.createForUsers(userIds, {
        type: params.type,
        titleKey: `${params.messageKey}.title`,
        bodyKey: `${params.messageKey}.body`,
        params: params.params,
        href: null,
      });
    } catch (caughtError) {
      this.logger.warn(
        buildSafeErrorLog('appointment_session_change_notification_failed', {
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
    }
  }

  private async assertCanChangeSessions(currentUser: CurrentUser): Promise<void> {
    const actor = await this.authRepository.findUserById(currentUser.sub);
    if (!actor) {
      throw new UnauthorizedException('User not found');
    }
    if (!this.hasAnyScope(actor, 'AppointmentSession', 'update')) {
      throw new ForbiddenException('Only the clinic administration can move or cancel sessions');
    }
  }

  private hasAnyScope(actor: Actor, resource: string, action: string): boolean {
    return actor.roles.some((userRole) =>
      userRole.role.permissions.some(
        ({ permission }) =>
          permission.resource === resource &&
          permission.action === action &&
          permission.scope === 'ANY',
      ),
    );
  }

  private async findSessionOrThrow(sessionId: string): Promise<MaterializedSessionRecord> {
    const session = await this.appointmentManagementRepository.findSessionWithCountById(
      sessionId,
      ADMIN_ACTOR_SCOPE,
    );
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  private buildInstant(sessionDate: string, time: string): Date {
    return buildZonedDateTime({ date: sessionDate, time, timeZone: this.clinicTimeZone });
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toSessionResponse(session: MaterializedSessionRecord): AppointmentSessionResponse {
    return {
      id: session.id,
      doctorId: session.doctorId,
      scheduleId: session.scheduleId,
      sessionDate: this.toDateString(session.sessionDate),
      startTime: session.startTime,
      endTime: session.endTime,
      maxPatients: session.maxPatients,
      status: session.status,
      bookedCount: session._count.appointments,
      statusReason: session.statusReason,
      movedToSessionId: session.movedToSessionId,
    };
  }
}
