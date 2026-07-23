import {
  Actor,
  AppointmentListItem,
  AppointmentWithRelationsRecord,
  canTransitionAppointmentStatus,
  isWithinDoctorAvailability,
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
import { CancelAppointmentDto } from '../dto/cancel-appointment.dto';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from '../dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { AppointmentManagementRepository } from '../repository/appointment-management.repository';

const RESCHEDULABLE_STATUSES = ['SCHEDULED', 'CONFIRMED'] as const;
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

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

  async createAppointment(payload: CreateAppointmentDto, currentUser: CurrentUser) {
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

    const scheduledAt = new Date(payload.scheduledAt);

    await this.assertSchedulableSlot({
      scheduledAt,
      doctorId: doctor.id,
      schedules: doctor.schedules,
    });

    const created = await this.appointmentManagementRepository.createAppointment({
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      scheduledAt,
      reason: payload.reason,
      notes: payload.notes,
      createdById: currentUser.sub,
    });

    return this.toAppointmentListItem(created);
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

  private async assertReschedulable(params: {
    appointment: AppointmentWithRelationsRecord;
    scheduledAt: Date;
    isPatientLimited: boolean;
  }): Promise<void> {
    const { appointment, scheduledAt, isPatientLimited } = params;
    const isRescheduleAllowed = isPatientLimited
      ? appointment.status === 'SCHEDULED'
      : RESCHEDULABLE_STATUSES.some((status) => status === appointment.status);

    if (!isRescheduleAllowed) {
      throw new ConflictException(
        `Appointment in status ${appointment.status} can not be rescheduled`,
      );
    }

    const doctor = await this.appointmentManagementRepository.findActiveDoctorById(
      appointment.doctorId,
    );

    if (!doctor) {
      throw new BadRequestException('Doctor not found or inactive');
    }

    await this.assertSchedulableSlot({
      scheduledAt,
      doctorId: doctor.id,
      schedules: doctor.schedules,
      excludeAppointmentId: appointment.id,
    });
  }

  private async assertSchedulableSlot(params: {
    scheduledAt: Date;
    doctorId: string;
    schedules: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
    }>;
    excludeAppointmentId?: string;
  }): Promise<void> {
    const { scheduledAt, doctorId, schedules, excludeAppointmentId } = params;

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid datetime');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    if (!isWithinDoctorAvailability({ scheduledAt, schedules, timeZone: this.clinicTimeZone })) {
      throw new BadRequestException('Doctor is not available at the requested time');
    }

    const conflictingAppointment =
      await this.appointmentManagementRepository.findConflictingAppointment({
        doctorId,
        scheduledAt,
        excludeAppointmentId,
      });

    if (conflictingAppointment) {
      throw new ConflictException('Doctor already has an appointment at the requested time');
    }
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
    return status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW';
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
        specialty: appointment.doctor.specialty,
      },
    };
  }
}
