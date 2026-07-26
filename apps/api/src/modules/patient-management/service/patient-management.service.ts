import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  Actor,
  collectNikDemographicWarnings,
  maskIdentifierLast4,
  PatientRecord,
  PatientSexValue,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
import { UpdatePatientDto } from '../dto/update-patient.dto';
import { PatientIdentifierConflictError } from '../repository/patient-identifier-conflict.error';
import { PatientManagementRepository } from '../repository/patient-management.repository';

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

    const result = await this.patientManagementRepository.listPatients(
      {
        page: query.page,
        limit: query.limit,
        search: query.search,
        nik: query.nik,
        bpjsNumber: query.bpjsNumber,
        doctorId: query.doctorId,
        status: query.status,
        createdFrom: query.createdFrom ? parseDateOnly(query.createdFrom) : undefined,
        createdTo: query.createdTo ? parseDateOnly(query.createdTo) : undefined,
      },
      currentUser,
      readScope.hasAny,
    );

    return {
      items: result.items.map((patient) => ({
        ...this.toPatientResponse(patient),
        doctorCount: patient._count.doctors,
        allergyCount: patient._count.allergies,
        doctors: patient.doctors.map((assignment) => ({
          id: assignment.doctor.id,
          assignmentId: assignment.id,
          fullName: assignment.doctor.fullName,
          specialty: assignment.doctor.specialty.name,
        })),
      })),
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

    const patient = await this.patientManagementRepository.findPatientDetailById(id);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (!readScope.hasAny && !(await this.canReadOwnPatient(patient, currentUser))) {
      throw new ForbiddenException('You are not allowed to read this patient');
    }

    return {
      ...this.toPatientResponse(patient),
      doctors: patient.doctors.map((assignment) => ({
        id: assignment.doctor.id,
        assignmentId: assignment.id,
        fullName: assignment.doctor.fullName,
        specialty: assignment.doctor.specialty.name,
      })),
      allergies: patient.allergies.map((allergy) => ({
        id: allergy.id,
        substance: allergy.substance,
        reaction: allergy.reaction ?? undefined,
        severity: allergy.severity,
        createdAt: allergy.createdAt.toISOString(),
        updatedAt: allergy.updatedAt.toISOString(),
      })),
    };
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

    await this.assertAssignableDoctorIds(payload.doctorIds);
    await this.assertIdentifiersAvailable({ nik: payload.nik, bpjsNumber: payload.bpjsNumber });

    const created = await this.createPatientRecord(payload, currentUser);

    return {
      patient: this.toPatientResponse(created),
      identifierWarnings: this.collectIdentifierWarnings({
        nik: payload.nik,
        dateOfBirth: payload.dateOfBirth,
        sex: payload.sex,
      }),
    };
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

    await this.assertIdentifiersAvailable(
      { nik: payload.nik, bpjsNumber: payload.bpjsNumber },
      id,
    );

    const updated = await this.updatePatientRecord(id, payload);

    return {
      patient: this.toPatientResponse(updated),
      identifierWarnings: this.collectIdentifierWarnings({
        nik: payload.nik,
        dateOfBirth: payload.dateOfBirth ?? toDateOnly(patient.dateOfBirth),
        sex: payload.sex ?? patient.sex ?? undefined,
      }),
    };
  }

  private async createPatientRecord(
    payload: CreatePatientDto,
    currentUser: CurrentUser,
  ): Promise<PatientRecord> {
    try {
      return await this.patientManagementRepository.createPatient({
        mrn: payload.mrn,
        fullName: payload.fullName,
        dateOfBirth: parseDateOnly(payload.dateOfBirth),
        placeOfBirth: payload.placeOfBirth,
        sex: payload.sex,
        status: payload.status,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        nik: payload.nik,
        bpjsNumber: payload.bpjsNumber,
        email: payload.email,
        bloodType: payload.bloodType,
        rhesusFactor: payload.rhesusFactor,
        maritalStatus: payload.maritalStatus,
        occupation: payload.occupation,
        religion: payload.religion,
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone,
        guardianName: payload.guardianName,
        guardianRelation: payload.guardianRelation,
        allergies: payload.allergies,
        ownerUserId: payload.ownerUserId,
        isActive: payload.isActive,
        doctorIds: payload.doctorIds,
        actorUserId: currentUser.sub,
      });
    } catch (err) {
      throw this.toIdentifierConflictException(err);
    }
  }

  private async updatePatientRecord(
    id: string,
    payload: UpdatePatientDto,
  ): Promise<PatientRecord> {
    try {
      return await this.patientManagementRepository.updatePatient(id, {
        fullName: payload.fullName,
        dateOfBirth: payload.dateOfBirth ? parseDateOnly(payload.dateOfBirth) : undefined,
        placeOfBirth: payload.placeOfBirth,
        sex: payload.sex,
        status: payload.status,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        nik: payload.nik,
        bpjsNumber: payload.bpjsNumber,
        email: payload.email,
        bloodType: payload.bloodType,
        rhesusFactor: payload.rhesusFactor,
        maritalStatus: payload.maritalStatus,
        occupation: payload.occupation,
        religion: payload.religion,
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone,
        guardianName: payload.guardianName,
        guardianRelation: payload.guardianRelation,
        allergies: payload.allergies,
        ownerUserId: payload.ownerUserId,
        isActive: payload.isActive,
      });
    } catch (err) {
      throw this.toIdentifierConflictException(err);
    }
  }

  /**
   * Rejects a create or update that would attach an identifier already held by
   * another patient. A collision means the two records are the same person, so
   * the operation is refused and routed to the duplicate-merge workflow rather
   * than producing a second record.
   */
  private async assertIdentifiersAvailable(
    identifiers: { nik?: string | null; bpjsNumber?: string | null },
    excludePatientId?: string,
  ): Promise<void> {
    if (identifiers.nik) {
      const existing = await this.patientManagementRepository.findPatientIdByNik(identifiers.nik);
      if (existing && existing.id !== excludePatientId) {
        throw new ConflictException('NIK already registered to another patient');
      }
    }
    if (identifiers.bpjsNumber) {
      const existing = await this.patientManagementRepository.findPatientIdByBpjsNumber(
        identifiers.bpjsNumber,
      );
      if (existing && existing.id !== excludePatientId) {
        throw new ConflictException('BPJS number already registered to another patient');
      }
    }
  }

  private toIdentifierConflictException(err: unknown): unknown {
    if (err instanceof PatientIdentifierConflictError) {
      return new ConflictException(
        err.field === 'nik'
          ? 'NIK already registered to another patient'
          : 'BPJS number already registered to another patient',
      );
    }
    return err;
  }

  private collectIdentifierWarnings(input: {
    nik?: string | null;
    dateOfBirth?: string;
    sex?: PatientSexValue;
  }): string[] {
    if (!input.nik) {
      return [];
    }
    return collectNikDemographicWarnings({
      nik: input.nik,
      dateOfBirth: input.dateOfBirth,
      sex: input.sex,
    });
  }

  private async canReadOwnPatient(
    patient: Pick<PatientRecord, 'id' | 'ownerUserId'>,
    currentUser: CurrentUser,
  ): Promise<boolean> {
    if (patient.ownerUserId === currentUser.sub) {
      return true;
    }

    return this.patientManagementRepository.hasActiveAssignmentWithDoctorUser(
      patient.id,
      currentUser.sub,
    );
  }

  private async assertAssignableDoctorIds(doctorIds?: string[]): Promise<void> {
    if (!doctorIds || doctorIds.length === 0) {
      return;
    }

    const uniqueDoctorIds = new Set(doctorIds);

    if (uniqueDoctorIds.size !== doctorIds.length) {
      throw new BadRequestException('Doctor IDs must be unique');
    }

    const activeDoctors = await this.patientManagementRepository.findActiveDoctorsByIds(doctorIds);

    if (activeDoctors.length !== doctorIds.length) {
      const foundDoctorIds = new Set(activeDoctors.map((doctor) => doctor.id));
      const missingDoctorIds = doctorIds.filter((doctorId) => !foundDoctorIds.has(doctorId));

      throw new BadRequestException(
        `Doctors not found or inactive: ${missingDoctorIds.join(', ')}`,
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

  /**
   * Identifiers leave the API masked. Full values require the
   * `patient.read-identifier` permission and an audit event, both delivered in
   * P7-T07 — until then there is no unmask path at all.
   */
  private toPatientResponse(patient: PatientRecord) {
    return {
      id: patient.id,
      mrn: patient.mrn,
      fullName: patient.fullName,
      dateOfBirth: toDateOnly(patient.dateOfBirth),
      placeOfBirth: patient.placeOfBirth ?? undefined,
      sex: patient.sex ?? undefined,
      status: patient.status,
      phoneNumber: patient.phoneNumber,
      address: patient.address,
      nikMasked: maskIdentifierLast4(patient.nikLast4),
      bpjsNumberMasked: maskIdentifierLast4(patient.bpjsNumberLast4),
      hasSatusehatPatientId: patient.hasSatusehatPatientId,
      email: patient.email ?? undefined,
      bloodType: patient.bloodType ?? undefined,
      rhesusFactor: patient.rhesusFactor ?? undefined,
      maritalStatus: patient.maritalStatus ?? undefined,
      occupation: patient.occupation ?? undefined,
      religion: patient.religion ?? undefined,
      emergencyContactName: patient.emergencyContactName ?? undefined,
      emergencyContactPhone: patient.emergencyContactPhone ?? undefined,
      guardianName: patient.guardianName ?? undefined,
      guardianRelation: patient.guardianRelation ?? undefined,
      ownerUserId: patient.ownerUserId ?? undefined,
      isActive: patient.isActive,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    };
  }
}
