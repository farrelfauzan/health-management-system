import {
  Actor,
  canTransitionRegistrationStatus,
  RegistrationListItem,
  RegistrationStatusValue,
  RegistrationWithRelationsRecord,
  UpdateRegistrationRecordPayload,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CreateRegistrationDto } from '../dto/create-registration.dto';
import { ListRegistrationsQueryDto } from '../dto/list-registrations-query.dto';
import { UpdateRegistrationDto } from '../dto/update-registration.dto';
import { RegistrationFlowRepository } from '../repository/registration-flow.repository';

const REGISTRABLE_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED'] as const;

function parseRegistrationDateOnly(value: string): Date {
  const [yearPart = '', monthPart = '', dayPart = ''] = value.split('-');
  return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart)));
}

@Injectable()
export class RegistrationFlowService {
  constructor(
    private readonly registrationFlowRepository: RegistrationFlowRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async listRegistrations(query: ListRegistrationsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Registration', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read registrations');
    }

    const result = await this.registrationFlowRepository.listRegistrations({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      patientId: query.patientId,
      registeredFrom: query.registeredFrom
        ? parseRegistrationDateOnly(query.registeredFrom)
        : undefined,
      registeredTo: query.registeredTo ? parseRegistrationDateOnly(query.registeredTo) : undefined,
      ownerUserId: readScope.hasAny ? undefined : currentUser.sub,
    });

    return {
      items: result.items.map((registration) => this.toRegistrationListItem(registration)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async getRegistrationById(id: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Registration', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read registrations');
    }

    const registration = await this.registrationFlowRepository.findRegistrationDetailById(id);

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (!readScope.hasAny && !this.isRegistrationOwner(registration, currentUser)) {
      throw new ForbiddenException('You are not allowed to read this registration');
    }

    return this.toRegistrationListItem(registration);
  }

  async createRegistration(payload: CreateRegistrationDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const createScope = this.resolveScope(actor, 'Registration', 'create');

    if (!createScope.hasAny && !createScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to create registrations');
    }

    const patient = await this.registrationFlowRepository.findActivePatientById(payload.patientId);

    if (!patient) {
      throw new BadRequestException('Patient not found or inactive');
    }

    if (!createScope.hasAny && patient.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('You can only create registrations for your own profile');
    }

    if (payload.appointmentId) {
      await this.assertAppointmentRegistrable({
        appointmentId: payload.appointmentId,
        patientId: payload.patientId,
      });
    }

    const openRegistration = await this.registrationFlowRepository.findOpenRegistrationByPatientId({
      patientId: payload.patientId,
    });

    if (openRegistration) {
      throw new ConflictException('Patient already has an open registration');
    }

    const created = await this.registrationFlowRepository.createRegistration({
      patientId: payload.patientId,
      appointmentId: payload.appointmentId,
      createdById: currentUser.sub,
    });

    return this.toRegistrationListItem(created);
  }

  async updateRegistration(id: string, payload: UpdateRegistrationDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Registration', 'update');

    if (!updateScope.hasAny && !updateScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to update registrations');
    }

    const registration = await this.registrationFlowRepository.findRegistrationDetailById(id);

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (!updateScope.hasAny && !this.isRegistrationOwner(registration, currentUser)) {
      throw new ForbiddenException('You are not allowed to update this registration');
    }

    const isPatientLimited = !updateScope.hasAny;

    if (isPatientLimited && payload.appointmentId !== undefined) {
      throw new ForbiddenException('Patients may not change the appointment link');
    }

    if (isPatientLimited && payload.status !== undefined && payload.status !== 'CANCELLED') {
      throw new ForbiddenException('Patients may only cancel their own registration');
    }

    if (payload.status !== undefined) {
      this.assertAllowedStatusTransition(registration.status, payload.status);
    }

    if (payload.appointmentId !== undefined) {
      await this.assertAppointmentLinkChangeable({ registration, payload });
    }

    const updated = await this.registrationFlowRepository.updateRegistration(
      this.buildUpdatePayload(id, payload),
    );

    return this.toRegistrationListItem(updated);
  }

  private buildUpdatePayload(
    id: string,
    payload: UpdateRegistrationDto,
  ): UpdateRegistrationRecordPayload {
    return {
      id,
      status: payload.status,
      appointmentId: payload.appointmentId,
      checkedInAt: payload.status === 'CHECKED_IN' ? new Date() : undefined,
      completedAt: payload.status === 'COMPLETED' ? new Date() : undefined,
    };
  }

  private async assertAppointmentLinkChangeable(params: {
    registration: RegistrationWithRelationsRecord;
    payload: UpdateRegistrationDto;
  }): Promise<void> {
    const { registration, payload } = params;

    if (registration.status !== 'PENDING') {
      throw new ConflictException(
        `Appointment link can only change while registration is PENDING`,
      );
    }

    if (payload.appointmentId) {
      await this.assertAppointmentRegistrable({
        appointmentId: payload.appointmentId,
        patientId: registration.patientId,
        excludeRegistrationId: registration.id,
      });
    }
  }

  private async assertAppointmentRegistrable(params: {
    appointmentId: string;
    patientId: string;
    excludeRegistrationId?: string;
  }): Promise<void> {
    const { appointmentId, patientId, excludeRegistrationId } = params;
    const appointment =
      await this.registrationFlowRepository.findActiveAppointmentById(appointmentId);

    if (!appointment) {
      throw new BadRequestException('Appointment not found');
    }

    if (appointment.patientId !== patientId) {
      throw new BadRequestException('Appointment does not belong to the patient');
    }

    const isRegistrable = REGISTRABLE_APPOINTMENT_STATUSES.some(
      (status) => status === appointment.status,
    );

    if (!isRegistrable) {
      throw new ConflictException(
        `Appointment in status ${appointment.status} can not be registered`,
      );
    }

    const existingRegistration =
      await this.registrationFlowRepository.findRegistrationByAppointmentId(
        appointmentId,
        excludeRegistrationId,
      );

    if (existingRegistration) {
      throw new ConflictException('Appointment already has a registration');
    }
  }

  private assertAllowedStatusTransition(
    fromStatus: RegistrationStatusValue,
    toStatus: RegistrationStatusValue,
  ): void {
    if (!canTransitionRegistrationStatus(fromStatus, toStatus)) {
      throw new ConflictException(
        `Registration status can not change from ${fromStatus} to ${toStatus}`,
      );
    }
  }

  private isRegistrationOwner(
    registration: RegistrationWithRelationsRecord,
    currentUser: CurrentUser,
  ): boolean {
    return registration.patient.ownerUserId === currentUser.sub;
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

  private toRegistrationListItem(
    registration: RegistrationWithRelationsRecord,
  ): RegistrationListItem {
    return {
      id: registration.id,
      patientId: registration.patientId,
      appointmentId: registration.appointmentId ?? undefined,
      status: registration.status,
      registeredAt: registration.registeredAt.toISOString(),
      checkedInAt: registration.checkedInAt?.toISOString(),
      completedAt: registration.completedAt?.toISOString(),
      createdById: registration.createdById ?? undefined,
      createdAt: registration.createdAt.toISOString(),
      updatedAt: registration.updatedAt.toISOString(),
      patient: {
        id: registration.patient.id,
        mrn: registration.patient.mrn,
        fullName: registration.patient.fullName,
      },
      appointment: registration.appointment
        ? {
            id: registration.appointment.id,
            scheduledAt: registration.appointment.scheduledAt.toISOString(),
            status: registration.appointment.status,
          }
        : undefined,
    };
  }
}
