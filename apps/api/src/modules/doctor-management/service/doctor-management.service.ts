import {
  Actor,
  DoctorRecord,
  DoctorScheduleRecord,
  hasScheduleOverlap,
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
import { CreateDoctorDto } from '../dto/create-doctor.dto';
import { ListDoctorsQueryDto } from '../dto/list-doctors-query.dto';
import { UpdateDoctorScheduleDto } from '../dto/update-doctor-schedule.dto';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';

@Injectable()
export class DoctorManagementService {
  constructor(
    private readonly doctorManagementRepository: DoctorManagementRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async listDoctors(query: ListDoctorsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Doctor', 'read');

    if (!readScope.hasAny) {
      throw new ForbiddenException('You are not allowed to read doctors');
    }

    const result = await this.doctorManagementRepository.listDoctors(query);

    return {
      items: result.items.map((doctor) => ({
        ...this.toDoctorResponse(doctor),
        patientCount: doctor._count.patients,
      })),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async getDoctorById(id: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Doctor', 'read');

    if (!readScope.hasAny) {
      throw new ForbiddenException('You are not allowed to read this doctor');
    }

    const doctor = await this.doctorManagementRepository.findDoctorDetailById(id);

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const canReadRelatedPatients = this.canReadRelatedPatients(actor, doctor, currentUser);

    return {
      ...this.toDoctorResponse(doctor),
      patientCount: doctor._count.patients,
      schedules: doctor.schedules.map((schedule) => this.toScheduleResponse(schedule)),
      ...(canReadRelatedPatients
        ? {
            patients: doctor.patients.map((assignment) => ({
              id: assignment.patient.id,
              mrn: assignment.patient.mrn,
              fullName: assignment.patient.fullName,
            })),
          }
        : {}),
    };
  }

  async createDoctor(payload: CreateDoctorDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const createScope = this.resolveScope(actor, 'Doctor', 'create');

    if (!createScope.hasAny) {
      throw new ForbiddenException('You are not allowed to create doctors');
    }

    const existingDoctor = await this.doctorManagementRepository.findDoctorByLicenseNumber(
      payload.licenseNumber,
    );

    if (existingDoctor) {
      throw new ConflictException('Doctor license number already exists');
    }

    if (payload.ownerUserId) {
      const ownerUser = await this.doctorManagementRepository.findActiveUserById(
        payload.ownerUserId,
      );

      if (!ownerUser) {
        throw new BadRequestException('Owner user not found');
      }

      const doctorWithSameOwner = await this.doctorManagementRepository.findDoctorByOwnerUserId(
        payload.ownerUserId,
      );

      if (doctorWithSameOwner) {
        throw new ConflictException('Owner user already has a doctor profile');
      }
    }

    await this.assertAssignablePatientIds(payload.patientIds);

    const created = await this.doctorManagementRepository.createDoctor({
      licenseNumber: payload.licenseNumber,
      fullName: payload.fullName,
      specialty: payload.specialty,
      phoneNumber: payload.phoneNumber,
      ownerUserId: payload.ownerUserId,
      isActive: payload.isActive,
      patientIds: payload.patientIds,
      actorUserId: currentUser.sub,
    });

    return this.toDoctorResponse(created);
  }

  async updateDoctorSchedule(
    id: string,
    payload: UpdateDoctorScheduleDto,
    currentUser: CurrentUser,
  ) {
    const actor = await this.getActorOrThrow(currentUser);
    const writeScope = this.resolveScope(actor, 'DoctorSchedule', 'write');

    if (!writeScope.hasAny && !writeScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to manage doctor schedules');
    }

    const doctor = await this.doctorManagementRepository.findDoctorById(id);

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    if (!writeScope.hasAny && doctor.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('You are not allowed to manage this doctor schedule');
    }

    this.assertValidScheduleEntries(payload.schedules);

    const schedules = await this.doctorManagementRepository.replaceDoctorSchedules({
      doctorId: id,
      entries: payload.schedules.map((entry) => ({
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
        isAvailable: entry.isAvailable,
      })),
    });

    return schedules.map((schedule) => this.toScheduleResponse(schedule));
  }

  private canReadRelatedPatients(
    actor: Actor,
    doctor: Pick<DoctorRecord, 'ownerUserId'>,
    currentUser: CurrentUser,
  ): boolean {
    const patientReadScope = this.resolveScope(actor, 'Patient', 'read');

    if (patientReadScope.hasAny) {
      return true;
    }

    return patientReadScope.hasOwn && doctor.ownerUserId === currentUser.sub;
  }

  private assertValidScheduleEntries(
    entries: Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }>,
  ): void {
    const hasInvalidRange = entries.some((entry) => entry.startTime >= entry.endTime);

    if (hasInvalidRange) {
      throw new BadRequestException('Schedule startTime must be earlier than endTime');
    }

    if (hasScheduleOverlap(entries)) {
      throw new BadRequestException('Schedule entries must not overlap on the same day');
    }
  }

  private async assertAssignablePatientIds(patientIds?: string[]): Promise<void> {
    if (!patientIds || patientIds.length === 0) {
      return;
    }

    const uniquePatientIds = new Set(patientIds);

    if (uniquePatientIds.size !== patientIds.length) {
      throw new BadRequestException('Patient IDs must be unique');
    }

    const activePatients =
      await this.doctorManagementRepository.findActivePatientsByIds(patientIds);

    if (activePatients.length !== patientIds.length) {
      const foundPatientIds = new Set(activePatients.map((patient) => patient.id));
      const missingPatientIds = patientIds.filter((patientId) => !foundPatientIds.has(patientId));

      throw new BadRequestException(
        `Patients not found or inactive: ${missingPatientIds.join(', ')}`,
      );
    }
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
        permission.resource === resource && permission.action === action && permission.scope === 'ANY',
    );
    const hasOwn = permissions.some(
      (permission) =>
        permission.resource === resource && permission.action === action && permission.scope === 'OWN',
    );

    return {
      hasAny,
      hasOwn,
    };
  }

  private toDoctorResponse(doctor: DoctorRecord) {
    return {
      id: doctor.id,
      licenseNumber: doctor.licenseNumber,
      fullName: doctor.fullName,
      specialty: doctor.specialty,
      phoneNumber: doctor.phoneNumber ?? undefined,
      ownerUserId: doctor.ownerUserId ?? undefined,
      isActive: doctor.isActive,
      createdAt: doctor.createdAt.toISOString(),
      updatedAt: doctor.updatedAt.toISOString(),
    };
  }

  private toScheduleResponse(schedule: DoctorScheduleRecord) {
    return {
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isAvailable: schedule.isAvailable,
    };
  }
}
