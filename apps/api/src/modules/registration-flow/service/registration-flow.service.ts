import {
  Actor,
  canTransitionRegistrationStatus,
  getCalendarDateInTimeZone,
  QueueBoardCounts,
  QueueBoardEntry,
  QueueBoardPoliSummary,
  QueueBoardResponse,
  RegistrationListItem,
  RegistrationPoli,
  RegistrationScopeActor,
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
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CreateRegistrationDto } from '../dto/create-registration.dto';
import { ListRegistrationsQueryDto } from '../dto/list-registrations-query.dto';
import { QueueBoardQueryDto } from '../dto/queue-board-query.dto';
import { UpdateRegistrationDto } from '../dto/update-registration.dto';
import { RegistrationFlowRepository } from '../repository/registration-flow.repository';
import { CurrentPrivacyNoticeEvidenceRequiredError } from '../../../common/privacy-notice/privacy-notice.repository';

const REGISTRABLE_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED'] as const;
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

function parseRegistrationDateOnly(value: string): Date {
  const [yearPart = '', monthPart = '', dayPart = ''] = value.split('-');
  return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart)));
}

function formatCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class RegistrationFlowService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly registrationFlowRepository: RegistrationFlowRepository,
    private readonly authRepository: AuthRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async listRegistrations(query: ListRegistrationsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Registration', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read registrations');
    }

    const result = await this.registrationFlowRepository.listRegistrations(
      {
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
        patientId: query.patientId,
        doctorId: query.doctorId,
        registeredFrom: query.registeredFrom
          ? parseRegistrationDateOnly(query.registeredFrom)
          : undefined,
        registeredTo: query.registeredTo
          ? parseRegistrationDateOnly(query.registeredTo)
          : undefined,
      },
      this.buildScopeActor(currentUser, readScope.hasAny),
    );

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

    // Patient-side scope rides in the repository where-clause (SJ-2): a row
    // outside the actor's reach comes back null, so not-found and not-yours
    // are the same 404 and a UUID probe learns nothing.
    const registration = await this.registrationFlowRepository.findRegistrationDetailById(
      id,
      this.buildScopeActor(currentUser, readScope.hasAny),
    );

    if (!registration) {
      throw new NotFoundException('Registration not found');
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

    if (!createScope.hasAny && payload.privacyNotice?.subjectType === 'REPRESENTATIVE') {
      throw new ForbiddenException('Patients cannot act as their own representative');
    }
    if (!createScope.hasAny && payload.privacyNotice?.outcome === 'DEFERRED_EMERGENCY') {
      throw new ForbiddenException('Emergency privacy notice deferral is staff-only');
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

    let created: RegistrationWithRelationsRecord;
    try {
      created = await this.registrationFlowRepository.createRegistration({
        patientId: payload.patientId,
        appointmentId: payload.appointmentId,
        createdById: currentUser.sub,
        actorUserId: currentUser.sub,
        queueDate: this.resolveClinicToday(),
        privacyNotice: payload.privacyNotice,
      });
    } catch (error) {
      if (error instanceof CurrentPrivacyNoticeEvidenceRequiredError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.toRegistrationListItem(created);
  }

  async getQueueBoard(query: QueueBoardQueryDto, currentUser: CurrentUser): Promise<QueueBoardResponse> {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Registration', 'read');
    // The board lists every patient in the day's queue by name, so OWN-scoped
    // read (the patient role) is not enough — patients see their own number on
    // their registration instead.
    if (!readScope.hasAny) {
      throw new ForbiddenException('You are not allowed to read the queue board');
    }
    const queueDate = query.date ? parseRegistrationDateOnly(query.date) : this.resolveClinicToday();
    const registrations = await this.registrationFlowRepository.listQueueBoard({
      queueDate,
      specialtyId: query.specialtyId,
    });
    const entries = registrations.flatMap((registration) =>
      registration.queueNumber === null
        ? []
        : [this.toQueueBoardEntry(registration, registration.queueNumber)],
    );
    return {
      date: formatCalendarDate(queueDate),
      counts: this.countQueueBoardEntries(entries),
      poli: this.summarizeQueueBoardPoli(entries),
      entries,
    };
  }

  private resolveClinicToday(): Date {
    return parseRegistrationDateOnly(getCalendarDateInTimeZone(new Date(), this.clinicTimeZone));
  }

  private toQueueBoardEntry(
    registration: RegistrationWithRelationsRecord,
    queueNumber: number,
  ): QueueBoardEntry {
    return {
      registrationId: registration.id,
      queueNumber,
      poliQueueNumber: registration.poliQueueNumber ?? undefined,
      poli: registration.specialty
        ? { id: registration.specialty.id, name: registration.specialty.name }
        : undefined,
      status: registration.status,
      registeredAt: registration.registeredAt.toISOString(),
      checkedInAt: registration.checkedInAt?.toISOString(),
      patient: {
        id: registration.patient.id,
        mrn: registration.patient.mrn,
        fullName: registration.patient.fullName,
      },
      doctor: registration.appointment
        ? {
            id: registration.appointment.doctor.id,
            fullName: registration.appointment.doctor.fullName,
            specialty: registration.appointment.doctor.specialty.name,
          }
        : undefined,
    };
  }

  /**
   * Groups the day's entries by poli so each poli's display can read its own
   * queue directly. Poli with no ticket that day are deliberately absent —
   * an empty row on a waiting-room screen reads as a poli that is running,
   * and a poli nobody registered for is not.
   */
  private summarizeQueueBoardPoli(entries: QueueBoardEntry[]): QueueBoardPoliSummary[] {
    const grouped = new Map<string, { poli: RegistrationPoli; entries: QueueBoardEntry[] }>();
    for (const entry of entries) {
      if (!entry.poli) {
        continue;
      }
      const existing = grouped.get(entry.poli.id);
      if (existing) {
        existing.entries.push(entry);
        continue;
      }
      grouped.set(entry.poli.id, { poli: entry.poli, entries: [entry] });
    }
    return [...grouped.values()]
      .map(({ poli, entries: poliEntries }) => {
        const counts = this.countQueueBoardEntries(poliEntries);
        return {
          poli,
          waiting: counts.pending + counts.checkedIn,
          counts,
          lastIssuedNumber: poliEntries.reduce(
            (highest, entry) => Math.max(highest, entry.poliQueueNumber ?? 0),
            0,
          ),
        };
      })
      .sort((left, right) => left.poli.name.localeCompare(right.poli.name));
  }

  private countQueueBoardEntries(entries: QueueBoardEntry[]): QueueBoardCounts {
    const countByStatus = (status: RegistrationStatusValue): number =>
      entries.filter((entry) => entry.status === status).length;
    return {
      pending: countByStatus('PENDING'),
      checkedIn: countByStatus('CHECKED_IN'),
      completed: countByStatus('COMPLETED'),
      cancelled: countByStatus('CANCELLED'),
    };
  }

  async updateRegistration(id: string, payload: UpdateRegistrationDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Registration', 'update');

    if (!updateScope.hasAny && !updateScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to update registrations');
    }

    const registration = await this.registrationFlowRepository.findRegistrationDetailById(
      id,
      this.buildScopeActor(currentUser, updateScope.hasAny),
    );

    if (!registration) {
      throw new NotFoundException('Registration not found');
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

  /**
   * Collapses a resolved permission scope into the actor context repositories
   * require. Callers gate the action first (no scope at all → 403); rows the
   * scope cannot reach are then the repository's business, never a post-fetch
   * check here (SJ-2).
   */
  private buildScopeActor(
    currentUser: CurrentUser,
    hasAnyScope: boolean,
  ): RegistrationScopeActor {
    return {
      userId: currentUser.sub,
      scope: hasAnyScope ? 'ANY' : 'OWN',
    };
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
      queueNumber: registration.queueNumber ?? undefined,
      queueDate: registration.queueDate ? formatCalendarDate(registration.queueDate) : undefined,
      poliQueueNumber: registration.poliQueueNumber ?? undefined,
      poli: registration.specialty
        ? { id: registration.specialty.id, name: registration.specialty.name }
        : undefined,
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
            doctor: {
              id: registration.appointment.doctor.id,
              fullName: registration.appointment.doctor.fullName,
              specialty: registration.appointment.doctor.specialty.name,
            },
          }
        : undefined,
    };
  }
}
