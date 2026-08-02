import {
  Actor,
  AppointmentListItem,
  AppointmentWithRelationsRecord,
  BookBpjsAntreanSessionInput,
  BookSessionSlotResult,
  CreateAppointmentInput,
  CreateSessionAppointmentInput,
  CreateSpecialRequestAppointmentInput,
  DoctorSessionCalendarItem,
  DoctorSessionListItem,
  SESSION_BOOKING_CUTOFF_MINUTES,
  SPECIAL_REQUEST_MIN_LEAD_DAYS,
  SessionQueueEntry,
  buildZonedDateTime,
  canTransitionAppointmentStatus,
  getDayOfWeekForDate,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { ApproveAppointmentDto } from '../dto/approve-appointment.dto';
import { CancelAppointmentDto } from '../dto/cancel-appointment.dto';
import { ListAppointmentsQueryDto } from '../dto/list-appointments-query.dto';
import { ListDoctorSessionsQueryDto } from '../dto/list-doctor-sessions-query.dto';
import { RejectAppointmentDto } from '../dto/reject-appointment.dto';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { UpdateAppointmentSessionDto } from '../dto/update-appointment-session.dto';
import { AppointmentManagementRepository } from '../repository/appointment-management.repository';

const RESCHEDULABLE_STATUSES = ['SCHEDULED', 'CONFIRMED'] as const;
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const MAX_SESSION_RANGE_DAYS = 92;
const DAY_IN_MS = 86_400_000;

@Injectable()
export class AppointmentManagementService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly appointmentManagementRepository: AppointmentManagementRepository,
    private readonly authRepository: AuthRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async listAppointments(query: ListAppointmentsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Appointment', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read appointments');
    }

    const result = await this.appointmentManagementRepository.listAppointments({
      page: query.page,
      limit: query.limit,
      status: query.status,
      doctorId: query.doctorId,
      patientId: query.patientId,
      scheduledFrom: query.scheduledFrom ? new Date(query.scheduledFrom) : undefined,
      scheduledTo: query.scheduledTo ? new Date(query.scheduledTo) : undefined,
      ownerUserId: readScope.hasAny ? undefined : currentUser.sub,
    });

    return {
      items: result.items.map((appointment) => this.toAppointmentListItem(appointment)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async getAppointmentById(id: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Appointment', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read appointments');
    }

    const appointment = await this.appointmentManagementRepository.findAppointmentDetailById(id);

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!readScope.hasAny && !this.isAppointmentOwner(appointment, currentUser)) {
      throw new ForbiddenException('You are not allowed to read this appointment');
    }

    return this.toAppointmentListItem(appointment);
  }

  async createAppointment(payload: CreateAppointmentInput, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const createScope = this.resolveScope(actor, 'Appointment', 'create');

    if (!createScope.hasAny && !createScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to create appointments');
    }

    const patient = await this.appointmentManagementRepository.findActivePatientById(
      payload.patientId,
    );

    if (!patient) {
      throw new BadRequestException('Patient not found or inactive');
    }

    const doctor = await this.appointmentManagementRepository.findActiveDoctorById(
      payload.doctorId,
    );

    if (!doctor) {
      throw new BadRequestException('Doctor not found or inactive');
    }

    const isOwnParticipant =
      patient.ownerUserId === currentUser.sub || doctor.ownerUserId === currentUser.sub;

    if (!createScope.hasAny && !isOwnParticipant) {
      throw new ForbiddenException('You can only create appointments you participate in');
    }

    if (payload.type === 'SESSION') {
      return this.createSessionBooking(payload, currentUser);
    }

    return this.createSpecialRequest(payload, actor, currentUser);
  }

  async approveAppointment(
    id: string,
    payload: ApproveAppointmentDto,
    currentUser: CurrentUser,
  ) {
    const appointment = await this.getRequestedAppointmentForReview(id, currentUser);
    const scheduledAt = payload.scheduledAt
      ? new Date(payload.scheduledAt)
      : appointment.scheduledAt;

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid datetime');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    const conflictingAppointment =
      await this.appointmentManagementRepository.findConflictingAppointment({
        doctorId: appointment.doctorId,
        scheduledAt,
        excludeAppointmentId: appointment.id,
      });

    if (conflictingAppointment) {
      throw new ConflictException('Doctor already has an appointment at the requested time');
    }

    const approved = await this.appointmentManagementRepository.updateAppointment({
      id,
      status: 'SCHEDULED',
      scheduledAt,
    });

    return this.toAppointmentListItem(approved);
  }

  async rejectAppointment(id: string, payload: RejectAppointmentDto, currentUser: CurrentUser) {
    const appointment = await this.getRequestedAppointmentForReview(id, currentUser);
    const rejectionLine = `Rejection reason: ${payload.reason}`;

    const rejected = await this.appointmentManagementRepository.updateAppointment({
      id: appointment.id,
      status: 'REJECTED',
      notes: appointment.notes ? `${appointment.notes}\n${rejectionLine}` : rejectionLine,
    });

    return this.toAppointmentListItem(rejected);
  }

  async listDoctorSessions(
    doctorId: string,
    query: ListDoctorSessionsQueryDto,
    currentUser: CurrentUser,
  ): Promise<DoctorSessionListItem[]> {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'AppointmentSession', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read appointment sessions');
    }

    this.assertSessionRangeWithinLimit(query.from, query.to);

    const doctor = await this.appointmentManagementRepository.findActiveDoctorById(doctorId);

    if (!doctor) {
      throw new NotFoundException('Doctor not found or inactive');
    }

    if (!readScope.hasAny && doctor.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('You are only allowed to read your own sessions');
    }

    const materializedSessions = await this.appointmentManagementRepository.listSessionsWithCounts(
      {
        doctorId,
        fromDate: query.from,
        toDate: query.to,
      },
    );

    return this.buildDoctorSessionItems({
      doctorId,
      schedules: doctor.schedules,
      materializedSessions,
      from: query.from,
      to: query.to,
    });
  }

  async listSessionsCalendar(
    query: ListDoctorSessionsQueryDto,
    currentUser: CurrentUser,
  ): Promise<DoctorSessionCalendarItem[]> {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'AppointmentSession', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read appointment sessions');
    }

    this.assertSessionRangeWithinLimit(query.from, query.to);

    const allDoctors = await this.appointmentManagementRepository.listActiveDoctorsWithSchedules();
    const doctors = readScope.hasAny
      ? allDoctors
      : allDoctors.filter((doctor) => doctor.ownerUserId === currentUser.sub);
    const materializedSessions = await this.appointmentManagementRepository.listSessionsWithCounts(
      {
        fromDate: query.from,
        toDate: query.to,
      },
    );
    const sessionsByDoctor = new Map<string, typeof materializedSessions>();
    for (const session of materializedSessions) {
      const doctorSessions = sessionsByDoctor.get(session.doctorId) ?? [];
      doctorSessions.push(session);
      sessionsByDoctor.set(session.doctorId, doctorSessions);
    }

    return doctors
      .flatMap((doctor) =>
        this.buildDoctorSessionItems({
          doctorId: doctor.id,
          schedules: doctor.schedules,
          materializedSessions: sessionsByDoctor.get(doctor.id) ?? [],
          from: query.from,
          to: query.to,
        }).map((session) => ({
          ...session,
          doctor: {
            id: doctor.id,
            fullName: doctor.fullName,
            specialty: doctor.specialty.name,
          },
        })),
      )
      .sort((a, b) =>
        `${a.sessionDate}|${a.startTime}`.localeCompare(`${b.sessionDate}|${b.startTime}`),
      );
  }

  private buildDoctorSessionItems(params: {
    doctorId: string;
    schedules: Array<{
      id: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
      maxPatients: number | null;
    }>;
    materializedSessions: Array<{
      id: string;
      doctorId: string;
      scheduleId: string | null;
      sessionDate: Date;
      startTime: string;
      endTime: string;
      maxPatients: number | null;
      status: DoctorSessionListItem['status'];
      _count: { appointments: number };
    }>;
    from: string;
    to: string;
  }): DoctorSessionListItem[] {
    const { doctorId, schedules, materializedSessions, from, to } = params;
    const sessionsByKey = new Map(
      materializedSessions.map((session) => [
        `${this.toDateString(session.sessionDate)}|${session.startTime}`,
        session,
      ]),
    );
    const coveredKeys = new Set<string>();
    const items: DoctorSessionListItem[] = [];
    for (const date of this.enumerateDates(from, to)) {
      const dayOfWeek = getDayOfWeekForDate(date);
      const windows = schedules.filter(
        (schedule) => schedule.isAvailable && schedule.dayOfWeek === dayOfWeek,
      );
      for (const window of windows) {
        const key = `${date}|${window.startTime}`;
        const session = sessionsByKey.get(key);
        coveredKeys.add(key);
        items.push(
          session
            ? this.toSessionListItem(session, window.id)
            : {
                id: null,
                scheduleId: window.id,
                doctorId,
                sessionDate: date,
                startTime: window.startTime,
                endTime: window.endTime,
                status: 'OPEN',
                maxPatients: window.maxPatients,
                bookedCount: 0,
                remaining: window.maxPatients,
              },
        );
      }
    }
    for (const [key, session] of sessionsByKey) {
      if (!coveredKeys.has(key)) {
        items.push(this.toSessionListItem(session, session.scheduleId ?? ''));
      }
    }
    return items.sort((a, b) =>
      `${a.sessionDate}|${a.startTime}`.localeCompare(`${b.sessionDate}|${b.startTime}`),
    );
  }

  async getSessionQueue(sessionId: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'AppointmentSession', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read appointment sessions');
    }

    const session = await this.appointmentManagementRepository.findSessionWithCountById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!readScope.hasAny && session.doctor.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('You are only allowed to read your own sessions');
    }

    const queue = await this.appointmentManagementRepository.getSessionQueue(sessionId);
    const entries: SessionQueueEntry[] = queue.map((appointment) => ({
      appointmentId: appointment.id,
      queueNumber: appointment.queueNumber,
      status: appointment.status,
      reason: appointment.reason ?? undefined,
      patient: appointment.patient,
    }));

    return {
      session: {
        id: session.id,
        doctorId: session.doctorId,
        scheduleId: session.scheduleId,
        sessionDate: this.toDateString(session.sessionDate),
        startTime: session.startTime,
        endTime: session.endTime,
        maxPatients: session.maxPatients,
        status: session.status,
        bookedCount: session._count.appointments,
      },
      queue: entries,
    };
  }

  async updateSession(
    sessionId: string,
    payload: UpdateAppointmentSessionDto,
    currentUser: CurrentUser,
  ) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'AppointmentSession', 'update');

    if (!updateScope.hasAny) {
      throw new ForbiddenException('You are not allowed to update appointment sessions');
    }

    const session = await this.appointmentManagementRepository.findSessionWithCountById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status === 'CANCELLED') {
      throw new ConflictException('A cancelled session can not be updated');
    }

    const updated = await this.appointmentManagementRepository.updateSession({
      id: sessionId,
      maxPatients: payload.maxPatients,
      status: payload.status,
    });

    return {
      id: updated.id,
      doctorId: updated.doctorId,
      scheduleId: updated.scheduleId,
      sessionDate: this.toDateString(updated.sessionDate),
      startTime: updated.startTime,
      endTime: updated.endTime,
      maxPatients: updated.maxPatients,
      status: updated.status,
      bookedCount: session._count.appointments,
    };
  }

  async updateAppointment(id: string, payload: UpdateAppointmentDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Appointment', 'update');

    if (!updateScope.hasAny && !updateScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to update appointments');
    }

    const appointment = await this.appointmentManagementRepository.findAppointmentDetailById(id);

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!updateScope.hasAny && !this.isAppointmentOwner(appointment, currentUser)) {
      throw new ForbiddenException('You are not allowed to update this appointment');
    }

    const isPatientLimited =
      !updateScope.hasAny && appointment.doctor.ownerUserId !== currentUser.sub;

    if (isPatientLimited && (payload.status !== undefined || payload.notes !== undefined)) {
      throw new ForbiddenException('Patients may only update scheduledAt and reason');
    }

    if (payload.status !== undefined) {
      this.assertAllowedStatusTransition(appointment.status, payload.status);
    }

    const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : undefined;

    if (scheduledAt) {
      await this.assertReschedulable({
        appointment,
        scheduledAt,
        isPatientLimited,
      });
    }

    if (
      scheduledAt === undefined &&
      payload.status === undefined &&
      this.isTerminalStatus(appointment.status)
    ) {
      throw new ConflictException(`Appointment in status ${appointment.status} can not be updated`);
    }

    const updated = await this.appointmentManagementRepository.updateAppointment({
      id,
      scheduledAt,
      status: payload.status,
      reason: payload.reason,
      notes: payload.notes,
    });

    return this.toAppointmentListItem(updated);
  }

  async cancelAppointment(id: string, payload: CancelAppointmentDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const cancelScope = this.resolveScope(actor, 'Appointment', 'cancel');

    if (!cancelScope.hasAny && !cancelScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to cancel appointments');
    }

    const appointment = await this.appointmentManagementRepository.findAppointmentDetailById(id);

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!cancelScope.hasAny && !this.isAppointmentOwner(appointment, currentUser)) {
      throw new ForbiddenException('You are not allowed to cancel this appointment');
    }

    if (!canTransitionAppointmentStatus(appointment.status, 'CANCELLED')) {
      throw new ConflictException(
        `Appointment in status ${appointment.status} can not be cancelled`,
      );
    }

    const cancelled = await this.appointmentManagementRepository.cancelAppointment({
      id,
      notes: this.buildCancellationNotes(appointment.notes, payload.reason),
    });

    return this.toAppointmentListItem(cancelled);
  }

  /**
   * Books a session slot on behalf of the inbound BPJS Antrean bridge
   * (P14-T04). A separate entry point from {@link createAppointment} rather
   * than a flag on it, for one reason worth stating: `bpjsBookingCode` must be
   * unsettable from the HTTP API. The request schema has no such field, and
   * this method is the only path that writes one — so no admin, patient, or
   * compromised client can mint a booking that P14-T05 will then skip
   * publishing because it looks like BPJS's own.
   *
   * Everything else is the ordinary session-booking path: the same permission
   * check, the same schedule-window validation, the same capacity lock. The
   * bridge gets no shortcuts through the business rules, only a field.
   */
  async bookSessionForBpjsAntrean(
    input: BookBpjsAntreanSessionInput,
    currentUser: CurrentUser,
  ): Promise<{ appointment: AppointmentListItem; queueNumber: number }> {
    const actor = await this.getActorOrThrow(currentUser);
    if (!this.resolveScope(actor, 'Appointment', 'create').hasAny) {
      throw new ForbiddenException('You are not allowed to create appointments');
    }
    const window = await this.resolveBookableWindow(input);
    const result = await this.appointmentManagementRepository.bookSessionSlot({
      patientId: input.patientId,
      doctorId: input.doctorId,
      scheduleId: window.id,
      sessionDate: input.sessionDate,
      startTime: window.startTime,
      endTime: window.endTime,
      maxPatients: window.maxPatients,
      scheduledAt: window.sessionStart,
      reason: input.reason,
      createdById: currentUser.sub,
      bpjsBookingCode: input.bpjsBookingCode,
    });
    if (result.outcome === 'DUPLICATE_BOOKING_CODE') {
      throw new ConflictException('Booking code already exists');
    }
    const appointment = await this.resolveBookedAppointment(result);
    return {
      appointment,
      queueNumber: result.outcome === 'BOOKED' ? result.queueNumber : 0,
    };
  }

  /**
   * Resolves a booking by BPJS's `kodebooking` (P14-T04). Read-scoped like
   * every other appointment read; the bridge's reserved actor holds
   * `appointment.read:any` and nothing narrower would work, since the booking
   * belongs to a patient the bridge does not own.
   */
  async getAppointmentByBpjsBookingCode(
    bpjsBookingCode: string,
    currentUser: CurrentUser,
  ): Promise<AppointmentListItem> {
    const actor = await this.getActorOrThrow(currentUser);
    if (!this.resolveScope(actor, 'Appointment', 'read').hasAny) {
      throw new ForbiddenException('You are not allowed to read appointments');
    }
    const appointment =
      await this.appointmentManagementRepository.findAppointmentByBpjsBookingCode(bpjsBookingCode);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return this.toAppointmentListItem(appointment);
  }

  private async resolveBookableWindow(input: BookBpjsAntreanSessionInput): Promise<{
    id: string;
    startTime: string;
    endTime: string;
    maxPatients: number | null;
    sessionStart: Date;
  }> {
    const window = await this.appointmentManagementRepository.findScheduleWindowById(
      input.scheduleId,
    );
    if (!window || window.doctorId !== input.doctorId || !window.isAvailable) {
      throw new BadRequestException('Schedule window not found for this doctor');
    }
    if (getDayOfWeekForDate(input.sessionDate) !== window.dayOfWeek) {
      throw new BadRequestException('sessionDate does not fall on the schedule day');
    }
    const sessionStart = buildZonedDateTime({
      date: input.sessionDate,
      time: window.startTime,
      timeZone: this.clinicTimeZone,
    });
    if (Date.now() >= sessionStart.getTime() - SESSION_BOOKING_CUTOFF_MINUTES * 60_000) {
      throw new BadRequestException(
        `Booking closes ${SESSION_BOOKING_CUTOFF_MINUTES} minutes before the session starts`,
      );
    }
    return {
      id: window.id,
      startTime: window.startTime,
      endTime: window.endTime,
      maxPatients: window.maxPatients,
      sessionStart,
    };
  }

  private async createSessionBooking(
    payload: CreateSessionAppointmentInput,
    currentUser: CurrentUser,
  ): Promise<AppointmentListItem> {
    const window = await this.appointmentManagementRepository.findScheduleWindowById(
      payload.scheduleId,
    );

    if (!window || window.doctorId !== payload.doctorId || !window.isAvailable) {
      throw new BadRequestException('Schedule window not found for this doctor');
    }

    if (getDayOfWeekForDate(payload.sessionDate) !== window.dayOfWeek) {
      throw new BadRequestException('sessionDate does not fall on the schedule day');
    }

    const sessionStart = buildZonedDateTime({
      date: payload.sessionDate,
      time: window.startTime,
      timeZone: this.clinicTimeZone,
    });
    const bookingClosesAtMs = sessionStart.getTime() - SESSION_BOOKING_CUTOFF_MINUTES * 60_000;

    if (Date.now() >= bookingClosesAtMs) {
      throw new BadRequestException(
        `Booking closes ${SESSION_BOOKING_CUTOFF_MINUTES} minutes before the session starts`,
      );
    }

    const result = await this.appointmentManagementRepository.bookSessionSlot({
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      scheduleId: window.id,
      sessionDate: payload.sessionDate,
      startTime: window.startTime,
      endTime: window.endTime,
      maxPatients: window.maxPatients,
      scheduledAt: sessionStart,
      reason: payload.reason,
      notes: payload.notes,
      createdById: currentUser.sub,
    });

    return this.resolveBookedAppointment(result);
  }

  private async createSpecialRequest(
    payload: CreateSpecialRequestAppointmentInput,
    actor: Actor,
    currentUser: CurrentUser,
  ): Promise<AppointmentListItem> {
    const requestedAt = new Date(payload.requestedAt);

    if (Number.isNaN(requestedAt.getTime())) {
      throw new BadRequestException('requestedAt must be a valid datetime');
    }

    if (requestedAt.getTime() <= Date.now()) {
      throw new BadRequestException('requestedAt must be in the future');
    }

    const canApprove = this.resolveScope(actor, 'Appointment', 'approve').hasAny;

    if (!canApprove && requestedAt.getTime() - Date.now() < SPECIAL_REQUEST_MIN_LEAD_DAYS * DAY_IN_MS) {
      throw new BadRequestException(
        `Special requests must be made at least ${SPECIAL_REQUEST_MIN_LEAD_DAYS} days in advance`,
      );
    }

    if (canApprove) {
      const conflictingAppointment =
        await this.appointmentManagementRepository.findConflictingAppointment({
          doctorId: payload.doctorId,
          scheduledAt: requestedAt,
        });

      if (conflictingAppointment) {
        throw new ConflictException('Doctor already has an appointment at the requested time');
      }
    }

    const created = await this.appointmentManagementRepository.createAppointment({
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      type: 'SPECIAL_REQUEST',
      status: canApprove ? 'SCHEDULED' : 'REQUESTED',
      scheduledAt: requestedAt,
      reason: payload.reason,
      notes: payload.notes,
      createdById: currentUser.sub,
    });

    return this.toAppointmentListItem(created);
  }

  private async resolveBookedAppointment(
    result: BookSessionSlotResult,
  ): Promise<AppointmentListItem> {
    if (result.outcome === 'SESSION_NOT_OPEN') {
      throw new ConflictException('Session is not open for booking');
    }

    if (result.outcome === 'SESSION_FULL') {
      throw new ConflictException('Session is full');
    }

    if (result.outcome === 'ALREADY_BOOKED') {
      throw new ConflictException('Patient already has a booking in this session');
    }

    if (result.outcome === 'DUPLICATE_BOOKING_CODE') {
      throw new ConflictException('Booking code already exists');
    }

    const created = await this.appointmentManagementRepository.findAppointmentDetailById(
      result.appointmentId,
    );

    if (!created) {
      throw new NotFoundException('Appointment not found after booking');
    }

    return this.toAppointmentListItem(created);
  }

  private async getRequestedAppointmentForReview(
    id: string,
    currentUser: CurrentUser,
  ): Promise<AppointmentWithRelationsRecord> {
    const actor = await this.getActorOrThrow(currentUser);
    const approveScope = this.resolveScope(actor, 'Appointment', 'approve');

    if (!approveScope.hasAny) {
      throw new ForbiddenException('You are not allowed to review appointment requests');
    }

    const appointment = await this.appointmentManagementRepository.findAppointmentDetailById(id);

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.type !== 'SPECIAL_REQUEST' || appointment.status !== 'REQUESTED') {
      throw new ConflictException('Only pending special requests can be reviewed');
    }

    return appointment;
  }

  private async assertReschedulable(params: {
    appointment: AppointmentWithRelationsRecord;
    scheduledAt: Date;
    isPatientLimited: boolean;
  }): Promise<void> {
    const { appointment, scheduledAt, isPatientLimited } = params;

    if (appointment.type === 'SESSION') {
      throw new BadRequestException(
        'Session bookings can not be rescheduled to a specific time; cancel and rebook another session',
      );
    }

    const isRescheduleAllowed = isPatientLimited
      ? appointment.status === 'SCHEDULED'
      : RESCHEDULABLE_STATUSES.some((status) => status === appointment.status);

    if (!isRescheduleAllowed) {
      throw new ConflictException(
        `Appointment in status ${appointment.status} can not be rescheduled`,
      );
    }

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid datetime');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    const conflictingAppointment =
      await this.appointmentManagementRepository.findConflictingAppointment({
        doctorId: appointment.doctorId,
        scheduledAt,
        excludeAppointmentId: appointment.id,
      });

    if (conflictingAppointment) {
      throw new ConflictException('Doctor already has an appointment at the requested time');
    }
  }

  private assertSessionRangeWithinLimit(from: string, to: string): void {
    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
    if ((toMs - fromMs) / DAY_IN_MS > MAX_SESSION_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range can not exceed ${MAX_SESSION_RANGE_DAYS} days`,
      );
    }
  }

  private enumerateDates(from: string, to: string): string[] {
    const dates: string[] = [];
    const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
    for (
      let cursorMs = new Date(`${from}T00:00:00.000Z`).getTime();
      cursorMs <= toMs;
      cursorMs += DAY_IN_MS
    ) {
      dates.push(new Date(cursorMs).toISOString().slice(0, 10));
    }
    return dates;
  }

  private toSessionListItem(
    session: {
      id: string;
      doctorId: string;
      scheduleId: string | null;
      sessionDate: Date;
      startTime: string;
      endTime: string;
      maxPatients: number | null;
      status: DoctorSessionListItem['status'];
      _count: { appointments: number };
    },
    scheduleId: string,
  ): DoctorSessionListItem {
    const bookedCount = session._count.appointments;
    return {
      id: session.id,
      scheduleId,
      doctorId: session.doctorId,
      sessionDate: this.toDateString(session.sessionDate),
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      maxPatients: session.maxPatients,
      bookedCount,
      remaining:
        session.maxPatients === null ? null : Math.max(0, session.maxPatients - bookedCount),
    };
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private assertAllowedStatusTransition(
    fromStatus: AppointmentWithRelationsRecord['status'],
    toStatus: AppointmentWithRelationsRecord['status'],
  ): void {
    if (!canTransitionAppointmentStatus(fromStatus, toStatus)) {
      throw new ConflictException(
        `Appointment status can not change from ${fromStatus} to ${toStatus}`,
      );
    }
  }

  private isTerminalStatus(status: AppointmentWithRelationsRecord['status']): boolean {
    return (
      status === 'COMPLETED' ||
      status === 'CANCELLED' ||
      status === 'REJECTED' ||
      status === 'NO_SHOW'
    );
  }

  private isAppointmentOwner(
    appointment: AppointmentWithRelationsRecord,
    currentUser: CurrentUser,
  ): boolean {
    return (
      appointment.patient.ownerUserId === currentUser.sub ||
      appointment.doctor.ownerUserId === currentUser.sub
    );
  }

  private buildCancellationNotes(
    existingNotes: string | null,
    cancellationReason?: string,
  ): string | undefined {
    if (!cancellationReason) {
      return undefined;
    }

    const cancellationLine = `Cancellation reason: ${cancellationReason}`;

    return existingNotes ? `${existingNotes}\n${cancellationLine}` : cancellationLine;
  }

  private async getActorOrThrow(currentUser: CurrentUser): Promise<Actor> {
    const actor = await this.authRepository.findUserById(currentUser.sub);

    if (!actor) {
      throw new UnauthorizedException('User not found');
    }

    return actor;
  }

  private resolveScope(actor: Actor, resource: string, action: string) {
    const permissions = actor.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    );

    const hasAny = permissions.some(
      (permission) =>
        permission.resource === resource &&
        permission.action === action &&
        permission.scope === 'ANY',
    );
    const hasOwn = permissions.some(
      (permission) =>
        permission.resource === resource &&
        permission.action === action &&
        permission.scope === 'OWN',
    );

    return {
      hasAny,
      hasOwn,
    };
  }

  private toAppointmentListItem(appointment: AppointmentWithRelationsRecord): AppointmentListItem {
    return {
      id: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      type: appointment.type,
      sessionId: appointment.sessionId ?? undefined,
      queueNumber: appointment.queueNumber ?? undefined,
      scheduledAt: appointment.scheduledAt.toISOString(),
      status: appointment.status,
      reason: appointment.reason ?? undefined,
      notes: appointment.notes ?? undefined,
      createdById: appointment.createdById ?? undefined,
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
      patient: {
        id: appointment.patient.id,
        mrn: appointment.patient.mrn,
        fullName: appointment.patient.fullName,
      },
      doctor: {
        id: appointment.doctor.id,
        fullName: appointment.doctor.fullName,
        specialty: appointment.doctor.specialty.name,
      },
    };
  }
}
