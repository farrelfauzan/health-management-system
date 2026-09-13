import {
  Actor,
  DoctorCredentialResolver,
  DoctorEducationInput,
  DoctorEducationRecord,
  DoctorIdentifiers,
  DoctorInvitationStatusValue,
  DoctorLicenseInput,
  DoctorLicenseRecord,
  DoctorLicenseWritePayload,
  DoctorOwnerPlan,
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
import { AdminManagementService } from '../../admin-management/service/admin-management.service';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { UserInvitationService } from '../../user-invitation/service/user-invitation.service';
import { CreateDoctorDto } from '../dto/create-doctor.dto';
import { InviteDoctorAccountDto } from '../dto/invite-doctor-account.dto';
import { ListDoctorsQueryDto } from '../dto/list-doctors-query.dto';
import { UpdateDoctorDto } from '../dto/update-doctor.dto';
import { UpdateDoctorScheduleDto } from '../dto/update-doctor-schedule.dto';
import { DoctorIdentifierConflictError } from '../repository/doctor-identifier-conflict.error';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';

const DOCTOR_AUDIT_RESOURCE = 'DoctorProfile';
const DOCTOR_ROLE_CODE = 'DOCTOR';

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
    private readonly userInvitationService: UserInvitationService,
    private readonly adminManagementService: AdminManagementService,
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

    await this.assertActiveSpecialtyId(payload.specialtyId);
    await this.assertAssignablePatientIds(payload.patientIds);
    await this.assertCredentialCodes({ title: payload.title, degrees: payload.degrees });
    await this.assertEducationFieldCodes(payload.educations);

    const ownerPlan = await this.resolveOwnerPlan(payload.email);

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
        ownerUserId: ownerPlan.kind === 'ATTACH' ? ownerPlan.userId : undefined,
        isActive: payload.isActive,
        patientIds: payload.patientIds,
        actorUserId: currentUser.sub,
      }),
    );

    return this.toDoctorResponse(
      await this.linkOwnerAccount(created, ownerPlan, currentUser.sub),
      await this.doctorCredentialOptionService.buildResolver(),
    );
  }

  /**
   * Gives a doctor who cannot sign in an account after the fact (P20-T01).
   *
   * This is the answer for doctors created before an address was required, and
   * for anyone whose invitation lapsed or was withdrawn: the same invite-or-
   * attach decision the create form makes, applied to a profile that already
   * exists. An administrative act, so it wants `update` on any doctor — a
   * doctor's own scope cannot mint their own login.
   */
  async inviteDoctorAccount(id: string, payload: InviteDoctorAccountDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    if (!this.resolveScope(actor, 'Doctor', 'update').hasAny) {
      throw new ForbiddenException('You are not allowed to invite doctors');
    }
    const doctor = await this.doctorManagementRepository.findDoctorById(id);
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    this.assertDoctorHasNoLogin(doctor);
    const ownerPlan = await this.resolveOwnerPlan(payload.email);
    if (ownerPlan.kind === 'ATTACH') {
      await this.doctorManagementRepository.updateDoctor(id, { ownerUserId: ownerPlan.userId });
    }
    await this.linkOwnerAccount(doctor, ownerPlan, currentUser.sub);
    const refreshed = await this.doctorManagementRepository.findDoctorById(id);
    if (!refreshed) {
      throw new NotFoundException('Doctor not found');
    }
    return this.toDoctorResponse(
      refreshed,
      await this.doctorCredentialOptionService.buildResolver(),
    );
  }

  /**
   * Refuses to invite a doctor who can already sign in, or who is already
   * waiting on a live link — a second invitation there is either a password
   * reset in disguise or a race between two links to one profile. A pending
   * invitation is resent from Administration, which revokes the old link.
   */
  private assertDoctorHasNoLogin(doctor: DoctorRecord): void {
    const status = this.resolveInvitationStatus(doctor);
    if (status === 'ACCEPTED') {
      throw new ConflictException({
        code: 'DOCTOR_ACCOUNT_ALREADY_LINKED',
        message: 'This doctor already has an account',
      });
    }
    if (status === 'PENDING') {
      throw new ConflictException({
        code: 'DOCTOR_INVITATION_ALREADY_PENDING',
        message: 'This doctor already has a pending invitation; resend it from Administration',
      });
    }
  }

  /**
   * Decides what the supplied email means before anything is written
   * (P19-T15).
   *
   * Every refusal an address can earn happens here, while the profile does not
   * exist yet — a 409 raised after the create would leave a doctor behind with
   * neither an account nor an invitation, which is exactly the two-places
   * problem this ticket exists to remove.
   */
  private async resolveOwnerPlan(email: string): Promise<DoctorOwnerPlan> {
    const plan = await this.userInvitationService.resolveDoctorOwnerPlan(email);
    if (plan.kind === 'INVITE') {
      return plan;
    }
    const doctorWithSameOwner = await this.doctorManagementRepository.findDoctorByOwnerUserId(
      plan.userId,
    );
    if (doctorWithSameOwner) {
      throw new ConflictException({
        code: 'DOCTOR_EMAIL_ALREADY_LINKED',
        message: 'This email already belongs to a doctor',
        errors: { email: 'This email already belongs to a doctor' },
      });
    }
    return plan;
  }

  /**
   * Finishes the account side of the create, after the profile is committed.
   *
   * It cannot be inside the profile's transaction, and the reason is the
   * direction of the foreign key: an invitation points at the doctor profile,
   * so the profile has to exist before the invitation row can. The invitation
   * flow already sends its email after its own commit for a related reason —
   * an SMTP timeout must not roll back the row the administrator can resend
   * from. What that costs is a window where the profile exists and the
   * invitation does not; every reason to refuse the address was spent in
   * {@link resolveOwnerPlan}, so what remains is an infrastructure failure, and
   * the recovery is the directory's send-invitation action
   * ({@link inviteDoctorAccount}), which is also the only other caller.
   */
  private async linkOwnerAccount(
    created: DoctorRecord,
    ownerPlan: DoctorOwnerPlan,
    actorUserId: string,
  ): Promise<DoctorRecord> {
    if (ownerPlan.kind === 'ATTACH') {
      // The account already exists, so there is nobody to invite — a second
      // invitation to somebody who can already log in is a password-reset
      // email wearing the wrong words. It may not hold DOCTOR yet, though.
      await this.adminManagementService.grantRoleCodes({
        userId: ownerPlan.userId,
        roleCodes: [DOCTOR_ROLE_CODE],
        assignedById: actorUserId,
      });
      return { ...created, ownerUser: { email: ownerPlan.email } };
    }
    const invitation = await this.userInvitationService.inviteDoctorOwner({
      email: ownerPlan.email,
      doctorProfileId: created.id,
      invitedById: actorUserId,
    });
    // Folded into the response rather than re-read: this row was just written,
    // and the create select ran before it existed.
    return {
      ...created,
      ownerInvitations: [{ email: invitation.email, expiresAt: new Date(invitation.expiresAt) }],
    };
  }

  async updateDoctor(id: string, payload: UpdateDoctorDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Doctor', 'update');

    // Administrative only (P20-T03). This route writes specialty, licences,
    // NIK, the SATUSEHAT id and `isActive` — the things the clinic asserts
    // about a doctor — so an own-scope caller here would be a doctor rewriting
    // their own credentials. A doctor edits themselves through
    // `me/doctor-profile`, whose schema carries only the fields that are
    // theirs. See D-025.
    if (!updateScope.hasAny) {
      throw new ForbiddenException(
        'You are not allowed to update doctors; edit your own details from your profile',
      );
    }

    const doctor = await this.doctorManagementRepository.findDoctorById(id);

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
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
    if (updated.clearedSatusehatLink) {
      await this.recordSatusehatLinkCleared(id, currentUser);
    }

    return this.toDoctorResponse(
      updated.doctor,
      await this.doctorCredentialOptionService.buildResolver(),
    );
  }

  /**
   * Records that a NIK change dropped the doctor's SATUSEHAT link (D-035).
   *
   * The NIK itself never reaches the audit row — only the fact that it changed,
   * which is the whole reason the link is gone. The worker relinks by lookup on
   * the next submission, so this row is usually the only trace that the old IHS
   * number was ever attached to this doctor.
   */
  private async recordSatusehatLinkCleared(
    doctorId: string,
    currentUser: CurrentUser,
  ): Promise<void> {
    await this.auditService.record({
      action: 'SATUSEHAT_LINK_CLEARED',
      resource: 'DoctorProfile',
      resourceId: doctorId,
      actorUserId: currentUser.sub,
      metadata: { reason: 'NIK_CHANGED' },
    });
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

  /**
   * The invitation still worth reading: unconsumed, unwithdrawn, and not yet
   * lapsed. The repository filters the first two in SQL; expiry is compared
   * here because only the reader knows what "now" is.
   */
  private resolveLiveInvitation(doctor: DoctorRecord, now: Date = new Date()) {
    return (doctor.ownerInvitations ?? []).find(
      (invitation) => invitation.expiresAt.getTime() > now.getTime(),
    );
  }

  /**
   * Whether this doctor can sign in yet (P19-T15).
   *
   * `ACCEPTED` is read off the account link rather than off the invitation's
   * `consumedAt`, and that is the honest source: an account exists and is
   * linked, whether it was minted by accepting the invitation or already
   * existed and was attached — in both cases the doctor can log in, which is
   * the question a directory row is asking. `NO_ACCOUNT` when there is neither
   * an account nor a live link (P20-T01): a doctor created before the address
   * was required, or one whose invitation lapsed — the state the directory's
   * send-invitation action exists for.
   */
  private resolveInvitationStatus(doctor: DoctorRecord): DoctorInvitationStatusValue {
    if (doctor.ownerUserId ?? doctor.ownerUser) {
      return 'ACCEPTED';
    }
    return this.resolveLiveInvitation(doctor) ? 'PENDING' : 'NO_ACCOUNT';
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
      // Sourced from the linked account, the only place it is stored — or,
      // before that account exists, from the invitation holding it (P19-T15).
      email: doctor.ownerUser?.email ?? this.resolveLiveInvitation(doctor)?.email,
      invitationStatus: this.resolveInvitationStatus(doctor),
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
