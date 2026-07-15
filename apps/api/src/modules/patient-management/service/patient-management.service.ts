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
import { CreatePatientDto } from '../dto/create-patient.dto';
import { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
import { UpdatePatientDto } from '../dto/update-patient.dto';
import { PatientManagementRepository } from '../repository/patient-management.repository';

type PermissionScope = 'ANY' | 'OWN';

type PermissionEntry = {
  action: string;
  resource: string;
  scope: PermissionScope;
};

type Actor = {
  roles: Array<{
    role: {
      permissions: Array<{
        permission: PermissionEntry;
      }>;
    };
  }>;
};

function parseDateOnly(value: string): Date {
  const parts = value.split('-');

  if (parts.length !== 3) {
    throw new BadRequestException('Invalid date format');
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new BadRequestException('Invalid date format');
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('Invalid date value');
  }

  return date;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class PatientManagementService {
  constructor(
    private readonly patientManagementRepository: PatientManagementRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async listPatients(query: ListPatientsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Patient', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read patients');
    }

    const result = await this.patientManagementRepository.listPatients(query, currentUser, readScope.hasAny);

    return {
      items: result.items.map((patient) => this.toPatientResponse(patient)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async getPatientById(id: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Patient', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read this patient');
    }

    const patient = await this.patientManagementRepository.findPatientById(id);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (!readScope.hasAny && patient.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('You are not allowed to read this patient');
    }

    return this.toPatientResponse(patient);
  }

  async createPatient(payload: CreatePatientDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const createScope = this.resolveScope(actor, 'Patient', 'create');

    if (!createScope.hasAny) {
      throw new ForbiddenException('You are not allowed to create patients');
    }

    const existingPatient = await this.patientManagementRepository.findPatientByMrn(payload.mrn);

    if (existingPatient) {
      throw new ConflictException('Patient MRN already exists');
    }

    if (payload.ownerUserId) {
      const ownerUser = await this.patientManagementRepository.findActiveUserById(payload.ownerUserId);

      if (!ownerUser) {
        throw new BadRequestException('Owner user not found');
      }
    }

    const created = await this.patientManagementRepository.createPatient({
      mrn: payload.mrn,
      fullName: payload.fullName,
      dateOfBirth: parseDateOnly(payload.dateOfBirth),
      phoneNumber: payload.phoneNumber,
      address: payload.address,
      ownerUserId: payload.ownerUserId,
      isActive: payload.isActive,
    });

    return this.toPatientResponse(created);
  }

  async updatePatient(id: string, payload: UpdatePatientDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Patient', 'update');

    if (!updateScope.hasAny && !updateScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to update patients');
    }

    const patient = await this.patientManagementRepository.findPatientById(id);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const isOwner = patient.ownerUserId === currentUser.sub;

    if (!updateScope.hasAny && !isOwner) {
      throw new ForbiddenException('You are not allowed to update this patient');
    }

    if (!updateScope.hasAny && payload.ownerUserId !== undefined) {
      throw new ForbiddenException('You are not allowed to change patient owner');
    }

    if (payload.ownerUserId) {
      const ownerUser = await this.patientManagementRepository.findActiveUserById(payload.ownerUserId);

      if (!ownerUser) {
        throw new BadRequestException('Owner user not found');
      }
    }

    const updated = await this.patientManagementRepository.updatePatient(id, {
      fullName: payload.fullName,
      dateOfBirth: payload.dateOfBirth ? parseDateOnly(payload.dateOfBirth) : undefined,
      phoneNumber: payload.phoneNumber,
      address: payload.address,
      ownerUserId: payload.ownerUserId,
      isActive: payload.isActive,
    });

    return this.toPatientResponse(updated);
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

  private toPatientResponse(patient: {
    id: string;
    mrn: string;
    fullName: string;
    dateOfBirth: Date;
    phoneNumber: string;
    address: string;
    ownerUserId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: patient.id,
      mrn: patient.mrn,
      fullName: patient.fullName,
      dateOfBirth: toDateOnly(patient.dateOfBirth),
      phoneNumber: patient.phoneNumber,
      address: patient.address,
      ownerUserId: patient.ownerUserId ?? undefined,
      isActive: patient.isActive,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    };
  }
}
