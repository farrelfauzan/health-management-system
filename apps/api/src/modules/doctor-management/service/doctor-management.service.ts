import {
  Actor,
  DoctorCredentialResolver,
  DoctorEducationInput,
  DoctorEducationRecord,
  DoctorIdentifiers,
  DoctorLicenseInput,
  DoctorLicenseRecord,
  DoctorLicenseWritePayload,
  DoctorRecord,
  DoctorScheduleRecord,
  buildDoctorDisplayName,
  hasScheduleOverlap,
  joinDegreeCodes,
  maskIdentifierLast4,
  splitDegreeCodes,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CreateDoctorDto } from '../dto/create-doctor.dto';
import { ListDoctorsQueryDto } from '../dto/list-doctors-query.dto';
import { UpdateDoctorDto } from '../dto/update-doctor.dto';
import { UpdateDoctorScheduleDto } from '../dto/update-doctor-schedule.dto';
import { DoctorIdentifierConflictError } from '../repository/doctor-identifier-conflict.error';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';

const DOCTOR_AUDIT_RESOURCE = 'DoctorProfile';

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toLicenseWritePayload(license: DoctorLicenseInput): DoctorLicenseWritePayload {
  return {
    type: license.type,
    licenseNumber: license.licenseNumber,
    issuedAt: license.issuedAt ? parseDateOnly(license.issuedAt) : null,
    expiresAt: license.expiresAt ? parseDateOnly(license.expiresAt) : null,
  };
}

@Injectable()
export class DoctorManagementService {
  constructor(
    private readonly doctorManagementRepository: DoctorManagementRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditService: AuditService,
    private readonly doctorCredentialOptionService: DoctorCredentialOptionService,
  ) {}

  async listDoctors(query: ListDoctorsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Doctor', 'read');

    if (!readScope.hasAny) {
      throw new ForbiddenException('You are not allowed to read doctors');
    }

    const result = await this.doctorManagementRepository.listDoctors(query);
    const resolveCredential = await this.doctorCredentialOptionService.buildResolver();

    return {
      items: result.items.map((doctor) => ({
        ...this.toDoctorResponse(doctor, resolveCredential),
        patientCount: doctor._count.patients,
        schedules: doctor.schedules.map((schedule) => this.toScheduleResponse(schedule)),
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
    const resolveCredential = await this.doctorCredentialOptionService.buildResolver();

    return {
      ...this.toDoctorResponse(doctor, resolveCredential),
      patientCount: doctor._count.patients,
      schedules: doctor.schedules.map((schedule) => this.toScheduleResponse(schedule)),
      licenses: doctor.licenses.map((license) => this.toLicenseResponse(license)),
      educations: doctor.educations.map((education) =>
        this.toEducationResponse(education, resolveCredential),
      ),
      ...(canReadRelatedPatients
        ? {
            patients: doctor.patients.map((assignment) => ({
              id: assignment.patient.id,
              assignmentId: assignment.id,
              mrn: assignment.patient.mrn,
              fullName: assignment.patient.fullName,
            })),
          }
        : {}),
    };
  }

  /**
   * Reveals the decrypted practitioner NIK. Same rules as the patient
   * equivalent — dedicated permission, audit event on every call — because a
   * practitioner NIK is the same Dukcapil citizen identifier and carries
   * identical UU PDP obligations. The `OWN` scope lets a doctor read back their
   * own NIK; nothing else reaches it.
   */
  async getDoctorIdentifiers(id: string, currentUser: CurrentUser): Promise<DoctorIdentifiers> {
    const actor = await this.getActorOrThrow(currentUser);
    const revealScope = this.resolveScope(actor, 'Doctor', 'read-identifier');

    if (!revealScope.hasAny && !revealScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read doctor identifiers');
    }

    const doctor = await this.doctorManagementRepository.findDoctorById(id);

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    if (!revealScope.hasAny && doctor.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('You are not allowed to read this doctor identifiers');
    }

    const identifiers = await this.doctorManagementRepository.findDoctorIdentifiers(id);

    if (!identifiers) {
      throw new NotFoundException('Doctor not found');
    }

    // The audit row records that a NIK was revealed and to whom, never the
    // value itself.
    await this.auditService.record({
      action: 'DOCTOR_IDENTIFIER_UNMASKED',
      resource: DOCTOR_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      metadata: {
        scope: revealScope.hasAny ? 'ANY' : 'OWN',
        fields: identifiers.nik === null ? [] : ['nik'],
      },
    });

    return {
      id: doctor.id,
      nik: identifiers.nik ?? undefined,
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

    if (payload.nik) {
      await this.assertNikNotTaken(payload.nik);
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

    await this.assertActiveSpecialtyId(payload.specialtyId);
    await this.assertAssignablePatientIds(payload.patientIds);
    await this.assertCredentialCodes({ title: payload.title, degrees: payload.degrees });
    await this.assertEducationFieldCodes(payload.educations);

    const created = await this.runWithIdentifierConflictMapping(() =>
      this.doctorManagementRepository.createDoctor({
        licenseNumber: payload.licenseNumber,
        fullName: payload.fullName,
        specialtyId: payload.specialtyId,
        phoneNumber: payload.phoneNumber,
        title: payload.title,
        degrees: payload.degrees ? (joinDegreeCodes(payload.degrees) ?? undefined) : undefined,
        nik: payload.nik,
        satusehatPractitionerId: payload.satusehatPractitionerId,
        licenses: payload.licenses?.map((license) => toLicenseWritePayload(license)),
        educations: payload.educations,
        ownerUserId: payload.ownerUserId,
        isActive: payload.isActive,
        patientIds: payload.patientIds,
        actorUserId: currentUser.sub,
      }),
    );

    return this.toDoctorResponse(created, await this.doctorCredentialOptionService.buildResolver());
  }

  async updateDoctor(id: string, payload: UpdateDoctorDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Doctor', 'update');

    if (!updateScope.hasAny && !updateScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to update doctors');
    }

    const doctor = await this.doctorManagementRepository.findDoctorById(id);

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const isOwner = doctor.ownerUserId === currentUser.sub;

    if (!updateScope.hasAny && !isOwner) {
      throw new ForbiddenException('You are not allowed to update this doctor');
    }

    if (!updateScope.hasAny && payload.ownerUserId !== undefined) {
      throw new ForbiddenException('You are not allowed to change doctor owner');
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

      if (doctorWithSameOwner && doctorWithSameOwner.id !== id) {
        throw new ConflictException('Owner user already has a doctor profile');
      }
    }

    if (payload.specialtyId !== undefined) {
      await this.assertActiveSpecialtyId(payload.specialtyId);
    }

    if (payload.nik) {
      await this.assertNikNotTaken(payload.nik, id);
    }

    // The doctor's own stored codes stay acceptable even after an admin
    // deactivates one, so switching an option off never strands the profiles
    // that already carry it.
    await this.assertCredentialCodes({
      title: payload.title ?? undefined,
      degrees: payload.degrees ?? undefined,
      retainedTitle: doctor.title,
      retainedDegrees: splitDegreeCodes(doctor.degrees),
    });
    await this.assertEducationFieldCodes(payload.educations, id);

    const updated = await this.runWithIdentifierConflictMapping(() =>
      this.doctorManagementRepository.updateDoctor(id, {
        fullName: payload.fullName,
        specialtyId: payload.specialtyId,
        phoneNumber: payload.phoneNumber,
        title: payload.title,
        degrees: payload.degrees === undefined ? undefined : joinDegreeCodes(payload.degrees ?? []),
        nik: payload.nik,
        satusehatPractitionerId: payload.satusehatPractitionerId,
        licenses: payload.licenses?.map((license) => toLicenseWritePayload(license)),
        educations: payload.educations,
        ownerUserId: payload.ownerUserId,
        isActive: payload.isActive,
      }),
    );

    return this.toDoctorResponse(updated, await this.doctorCredentialOptionService.buildResolver());
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
        maxPatients: entry.maxPatients ?? null,
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

  private async assertNikNotTaken(nik: string, currentDoctorId?: string): Promise<void> {
    const doctorWithSameNik = await this.doctorManagementRepository.findDoctorByNik(nik);
    if (doctorWithSameNik && doctorWithSameNik.id !== currentDoctorId) {
      throw new ConflictException('Doctor NIK already exists');
    }
  }

  /**
   * Maps the repository's uniqueness-race error onto the same 409 the
   * {@link assertNikNotTaken} pre-check raises, so a concurrent write and a
   * sequential one are indistinguishable to the caller.
   */
  private async runWithIdentifierConflictMapping<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (err instanceof DoctorIdentifierConflictError) {
        throw new ConflictException('Doctor NIK already exists');
      }
      throw err;
    }
  }

  private async assertActiveSpecialtyId(specialtyId: string): Promise<void> {
    const specialty = await this.doctorManagementRepository.findActiveSpecialtyById(specialtyId);
    if (!specialty) {
      throw new BadRequestException('Specialty not found or inactive');
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

  /**
   * The practitioner NIK leaves the API masked, exactly like a patient's. Full
   * values come only from {@link getDoctorIdentifiers}, which requires
   * `doctor.read-identifier` and audits the disclosure.
   */
  /**
   * The doctor form no longer accepts typed-in credentials (P19-T14), so a
   * code that names no live option is a bad request rather than a new spelling
   * of an existing credential.
   */
  private async assertCredentialCodes(params: {
    title?: string;
    degrees?: string[];
    retainedTitle?: string | null;
    retainedDegrees?: string[];
  }): Promise<void> {
    const { title, degrees, retainedTitle, retainedDegrees } = params;
    if (title !== undefined) {
      await this.doctorCredentialOptionService.assertUsableCodes({
        kind: 'TITLE',
        codes: [title],
        field: 'title',
        retainedCodes: retainedTitle ? [retainedTitle] : [],
      });
    }
    if (degrees !== undefined) {
      await this.doctorCredentialOptionService.assertUsableCodes({
        kind: 'DEGREE',
        codes: degrees,
        field: 'degrees',
        retainedCodes: retainedDegrees ?? [],
      });
    }
  }

  private async assertEducationFieldCodes(
    educations: DoctorEducationInput[] | undefined,
    doctorId?: string,
  ): Promise<void> {
    if (!educations) {
      return;
    }
    const codes = educations
      .map((education) => education.fieldOfStudy)
      .filter((code): code is string => Boolean(code));
    const retainedCodes = doctorId
      ? await this.doctorManagementRepository.listEducationFieldOfStudyCodes(doctorId)
      : [];
    await this.doctorCredentialOptionService.assertUsableCodes({
      kind: 'FIELD_OF_STUDY',
      codes,
      field: 'educations.fieldOfStudy',
      retainedCodes,
    });
  }

  private toDoctorResponse(doctor: DoctorRecord, resolveCredential: DoctorCredentialResolver) {
    const titleValue = doctor.title ? resolveCredential('TITLE', doctor.title) : undefined;
    const degreeValues = splitDegreeCodes(doctor.degrees).map((code) =>
      resolveCredential('DEGREE', code),
    );

    return {
      id: doctor.id,
      licenseNumber: doctor.licenseNumber,
      fullName: doctor.fullName,
      specialtyId: doctor.specialtyId,
      specialty: doctor.specialty.name,
      phoneNumber: doctor.phoneNumber ?? undefined,
      // Sourced from the linked account, the only place it is stored.
      email: doctor.ownerUser?.email ?? undefined,
      // Printed forms, not the stored codes: everything that reads a doctor
      // wanted the printed form before the catalog existed and still does.
      title: titleValue?.label,
      degrees:
        degreeValues.length > 0 ? degreeValues.map((value) => value.label).join(', ') : undefined,
      titleValue,
      degreeValues,
      displayName: buildDoctorDisplayName({
        title: titleValue?.label,
        fullName: doctor.fullName,
        degrees: degreeValues.map((value) => value.label),
      }),
      nikMasked: maskIdentifierLast4(doctor.nikLast4),
      satusehatPractitionerId: doctor.satusehatPractitionerId ?? undefined,
      ownerUserId: doctor.ownerUserId ?? undefined,
      isActive: doctor.isActive,
      createdAt: doctor.createdAt.toISOString(),
      updatedAt: doctor.updatedAt.toISOString(),
    };
  }

  private toLicenseResponse(license: DoctorLicenseRecord) {
    return {
      id: license.id,
      type: license.type,
      licenseNumber: license.licenseNumber,
      issuedAt: license.issuedAt ? toDateOnly(license.issuedAt) : undefined,
      expiresAt: license.expiresAt ? toDateOnly(license.expiresAt) : undefined,
      createdAt: license.createdAt.toISOString(),
      updatedAt: license.updatedAt.toISOString(),
    };
  }

  private toEducationResponse(
    education: DoctorEducationRecord,
    resolveCredential: DoctorCredentialResolver,
  ) {
    const fieldOfStudyValue = education.fieldOfStudy
      ? resolveCredential('FIELD_OF_STUDY', education.fieldOfStudy)
      : undefined;

    return {
      id: education.id,
      institution: education.institution,
      degree: education.degree,
      fieldOfStudy: fieldOfStudyValue?.label,
      fieldOfStudyValue,
      graduationYear: education.graduationYear ?? undefined,
      createdAt: education.createdAt.toISOString(),
      updatedAt: education.updatedAt.toISOString(),
    };
  }

  private toScheduleResponse(schedule: DoctorScheduleRecord) {
    return {
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isAvailable: schedule.isAvailable,
      maxPatients: schedule.maxPatients,
    };
  }
}
