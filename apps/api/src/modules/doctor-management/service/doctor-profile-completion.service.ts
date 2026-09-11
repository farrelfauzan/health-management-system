import { DoctorRecord, joinDegreeCodes, splitDegreeCodes } from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CompleteOwnDoctorProfileDto } from '../dto/complete-own-doctor-profile.dto';
import { DoctorIdentifierConflictError } from '../repository/doctor-identifier-conflict.error';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';
import { DoctorManagementService } from './doctor-management.service';

const DOCTOR_AUDIT_RESOURCE = 'DoctorProfile';
const DOCTOR_ROLE_CODE = 'DOCTOR';
const NIK_TAKEN_MESSAGE = 'This NIK already belongs to another doctor';

/**
 * The profile-completion screen's write (P20-T02, see D-026).
 *
 * Two starting points, one outcome. A doctor invited from Administration signs
 * in with no doctor profile at all, so this creates it — with the specialty,
 * STR licence number and NIK they enter once. A doctor whose profile the
 * clinic started but left short fills in only what is still empty; anything
 * the clinic already set is refused rather than overwritten, which is what
 * keeps "enter it once" consistent with D-025. Either way the caller is the
 * owner, resolved from the session, never from a path.
 *
 * The session hint that gates the doctor is only rewritten at issuance, so the
 * web refreshes the session straight after this returns.
 */
@Injectable()
export class DoctorProfileCompletionService {
  constructor(
    private readonly doctorManagementRepository: DoctorManagementRepository,
    private readonly doctorManagementService: DoctorManagementService,
    private readonly doctorCredentialOptionService: DoctorCredentialOptionService,
    private readonly auditService: AuditService,
    private readonly authRepository: AuthRepository,
  ) {}

  async completeOwnDoctorProfile(payload: CompleteOwnDoctorProfileDto, currentUser: CurrentUser) {
    await this.assertHoldsDoctorRole(currentUser);
    const existing = await this.doctorManagementRepository.findDoctorByOwnerUserId(currentUser.sub);
    const doctorId = existing
      ? await this.fillOwnDoctorProfile(existing.id, payload, currentUser)
      : await this.createOwnDoctorProfile(payload, currentUser);
    return this.doctorManagementService.getDoctorById(doctorId, currentUser);
  }

  /**
   * The gate is for doctors only (P20-T04 has not decided what a profile is
   * for anyone else), and so is the only way to mint a doctor profile without
   * an administrator.
   */
  private async assertHoldsDoctorRole(currentUser: CurrentUser): Promise<void> {
    const actor = await this.authRepository.findUserById(currentUser.sub);
    const isDoctor = (actor?.roles ?? []).some(
      (userRole) => userRole.unassignedAt === null && userRole.role.code === DOCTOR_ROLE_CODE,
    );
    if (!isDoctor) {
      throw new ForbiddenException('Only a doctor can complete a doctor profile');
    }
  }

  private async createOwnDoctorProfile(
    payload: CompleteOwnDoctorProfileDto,
    currentUser: CurrentUser,
  ): Promise<string> {
    const { specialtyId, licenseNumber, nik } = payload;
    if (!specialtyId || !licenseNumber || !nik) {
      throw this.buildMissingCreationFieldsError(payload);
    }
    await this.assertLicenseNumberFree(licenseNumber);
    await this.assertNikFree(nik);
    await this.assertActiveSpecialty(specialtyId);
    await this.assertUsableCredentialCodes(payload, null);
    const created = await this.runWithNikConflictMapping(() =>
      this.doctorManagementRepository.createDoctor({
        licenseNumber,
        fullName: payload.fullName,
        specialtyId,
        phoneNumber: payload.phoneNumber,
        title: payload.title,
        degrees: payload.degrees ? (joinDegreeCodes(payload.degrees) ?? undefined) : undefined,
        nik,
        ownerUserId: currentUser.sub,
        isActive: true,
        actorUserId: currentUser.sub,
      }),
    );
    await this.recordCompletion('CREATE', created.id, payload, currentUser);
    return created.id;
  }

  private async fillOwnDoctorProfile(
    doctorId: string,
    payload: CompleteOwnDoctorProfileDto,
    currentUser: CurrentUser,
  ): Promise<string> {
    const doctor = await this.doctorManagementRepository.findDoctorById(doctorId);
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    this.assertClinicFieldsUnchanged(payload, doctor);
    const nikToSet = await this.resolveNikToSet(payload.nik, doctor);
    await this.assertUsableCredentialCodes(payload, doctor);
    await this.runWithNikConflictMapping(() =>
      this.doctorManagementRepository.updateDoctor(doctorId, {
        fullName: payload.fullName,
        phoneNumber: payload.phoneNumber,
        title: payload.title,
        degrees: payload.degrees === undefined ? undefined : joinDegreeCodes(payload.degrees),
        nik: nikToSet,
      }),
    );
    await this.recordCompletion('UPDATE', doctorId, payload, currentUser);
    return doctorId;
  }

  private buildMissingCreationFieldsError(
    payload: CompleteOwnDoctorProfileDto,
  ): BadRequestException {
    const missing = (['specialtyId', 'licenseNumber', 'nik'] as const).filter(
      (field) => !payload[field],
    );
    return new BadRequestException({
      code: 'DOCTOR_PROFILE_FIELDS_REQUIRED',
      message: 'Specialty, STR number and NIK are required to create your doctor profile',
      errors: Object.fromEntries(missing.map((field) => [field, 'Required'])),
    });
  }

  /**
   * Specialty and licence number are never empty on an existing profile — the
   * clinic set them when it created it — so any different value here is an
   * attempt to change a credential, not to complete one (D-025).
   */
  private assertClinicFieldsUnchanged(
    payload: CompleteOwnDoctorProfileDto,
    doctor: Pick<DoctorRecord, 'specialtyId' | 'licenseNumber'>,
  ): void {
    const changed = [
      payload.specialtyId !== undefined && payload.specialtyId !== doctor.specialtyId
        ? 'specialtyId'
        : null,
      payload.licenseNumber !== undefined && payload.licenseNumber !== doctor.licenseNumber
        ? 'licenseNumber'
        : null,
    ].filter((field): field is 'specialtyId' | 'licenseNumber' => field !== null);
    if (changed.length > 0) {
      throw this.buildLockedFieldsError(changed);
    }
  }

  /**
   * A NIK may be entered once, while the profile has none. Re-sending the NIK
   * already on file is harmless and ignored; a different one is a change, and
   * NIK changes go through an administrator and P21-T09's unlink rule.
   */
  private async resolveNikToSet(
    nik: string | undefined,
    doctor: Pick<DoctorRecord, 'id' | 'nikLast4'>,
  ): Promise<string | undefined> {
    if (!nik) {
      return undefined;
    }
    const holder = await this.doctorManagementRepository.findDoctorByNik(nik);
    if (holder && holder.id !== doctor.id) {
      throw new ConflictException({
        code: 'DOCTOR_NIK_TAKEN',
        message: NIK_TAKEN_MESSAGE,
        errors: { nik: NIK_TAKEN_MESSAGE },
      });
    }
    if (!doctor.nikLast4) {
      return nik;
    }
    if (holder?.id === doctor.id) {
      return undefined;
    }
    throw this.buildLockedFieldsError(['nik']);
  }

  private buildLockedFieldsError(fields: readonly string[]): ConflictException {
    const message = 'Already set by your clinic; ask an administrator to change it';
    return new ConflictException({
      code: 'DOCTOR_PROFILE_FIELD_LOCKED',
      message,
      errors: Object.fromEntries(fields.map((field) => [field, message])),
    });
  }

  private async assertLicenseNumberFree(licenseNumber: string): Promise<void> {
    const holder = await this.doctorManagementRepository.findDoctorByLicenseNumber(licenseNumber);
    if (holder) {
      const message = 'This STR number already belongs to another doctor';
      throw new ConflictException({
        code: 'DOCTOR_LICENSE_TAKEN',
        message,
        errors: { licenseNumber: message },
      });
    }
  }

  private async assertNikFree(nik: string): Promise<void> {
    if (await this.doctorManagementRepository.findDoctorByNik(nik)) {
      throw new ConflictException({
        code: 'DOCTOR_NIK_TAKEN',
        message: NIK_TAKEN_MESSAGE,
        errors: { nik: NIK_TAKEN_MESSAGE },
      });
    }
  }

  private async assertActiveSpecialty(specialtyId: string): Promise<void> {
    if (!(await this.doctorManagementRepository.findActiveSpecialtyById(specialtyId))) {
      throw new BadRequestException({
        message: 'Specialty not found or inactive',
        errors: { specialtyId: 'Specialty not found or inactive' },
      });
    }
  }

  /** The same catalog rule as every other doctor write; stored codes stay valid. */
  private async assertUsableCredentialCodes(
    payload: CompleteOwnDoctorProfileDto,
    doctor: Pick<DoctorRecord, 'title' | 'degrees'> | null,
  ): Promise<void> {
    if (payload.title) {
      await this.doctorCredentialOptionService.assertUsableCodes({
        kind: 'TITLE',
        codes: [payload.title],
        field: 'title',
        retainedCodes: doctor?.title ? [doctor.title] : [],
      });
    }
    if (payload.degrees) {
      await this.doctorCredentialOptionService.assertUsableCodes({
        kind: 'DEGREE',
        codes: payload.degrees,
        field: 'degrees',
        retainedCodes: splitDegreeCodes(doctor?.degrees ?? null),
      });
    }
  }

  /** A concurrent claim on the same NIK lands as the same 409 as the pre-check. */
  private async runWithNikConflictMapping<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (err instanceof DoctorIdentifierConflictError) {
        throw new ConflictException({
          code: 'DOCTOR_NIK_TAKEN',
          message: NIK_TAKEN_MESSAGE,
          errors: { nik: NIK_TAKEN_MESSAGE },
        });
      }
      throw err;
    }
  }

  /** Field names only, never values — the same rule as other self-edits (D-025). */
  private async recordCompletion(
    action: 'CREATE' | 'UPDATE',
    doctorId: string,
    payload: CompleteOwnDoctorProfileDto,
    currentUser: CurrentUser,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: DOCTOR_AUDIT_RESOURCE,
      resourceId: doctorId,
      actorUserId: currentUser.sub,
      metadata: {
        scope: 'OWN',
        completion: true,
        fields: Object.keys(payload).filter(
          (field) => payload[field as keyof CompleteOwnDoctorProfileDto] !== undefined,
        ),
      },
    });
  }
}
