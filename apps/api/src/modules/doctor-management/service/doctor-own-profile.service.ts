import { DoctorRecord, joinDegreeCodes, splitDegreeCodes } from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { UpdateOwnDoctorProfileDto } from '../dto/update-own-doctor-profile.dto';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';
import { DoctorManagementService } from './doctor-management.service';

const DOCTOR_AUDIT_RESOURCE = 'DoctorProfile';

/**
 * A doctor reading and correcting their own profile (P20-T03).
 *
 * "Own" is resolved from the caller, never from a path parameter: the profile
 * is the one whose `ownerUserId` is the signed-in user, so there is no id a
 * doctor could swap for a colleague's. What they may change is fixed by
 * `updateOwnDoctorProfileSchema` — name, title, degrees, phone and education —
 * and the reasoning for that split is D-025.
 *
 * {@link resolveOwnDoctorProfileId} is exported from the module on purpose:
 * P21-T04's doctor-facing SATUSEHAT view needs the same "which profile is
 * mine" answer, and one rule for it is the point.
 */
@Injectable()
export class DoctorOwnProfileService {
  constructor(
    private readonly doctorManagementRepository: DoctorManagementRepository,
    private readonly doctorManagementService: DoctorManagementService,
    private readonly doctorCredentialOptionService: DoctorCredentialOptionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * The id of the doctor profile linked to this user account. A user with no
   * profile — a pharmacist, an administrator, a doctor whose invitation was
   * raised without one — gets a 404 that says so, never a 500.
   */
  async resolveOwnDoctorProfileId(userId: string): Promise<string> {
    const doctor = await this.doctorManagementRepository.findDoctorByOwnerUserId(userId);
    if (!doctor) {
      throw new NotFoundException({
        code: 'DOCTOR_PROFILE_NOT_FOUND',
        message: 'No doctor profile is linked to this account',
      });
    }
    return doctor.id;
  }

  /** The caller's own profile, in the same shape as the doctor detail. */
  async getOwnDoctorProfile(currentUser: CurrentUser) {
    const doctorId = await this.resolveOwnDoctorProfileId(currentUser.sub);
    return this.doctorManagementService.getDoctorById(doctorId, currentUser);
  }

  /**
   * Applies the fields a doctor owns and audits the change with the doctor as
   * the actor. The audit names which fields changed, not their values — a
   * name and a phone number are personal data, and "who changed what, when"
   * is the question the log answers.
   */
  async updateOwnDoctorProfile(payload: UpdateOwnDoctorProfileDto, currentUser: CurrentUser) {
    const doctorId = await this.resolveOwnDoctorProfileId(currentUser.sub);
    const doctor = await this.doctorManagementRepository.findDoctorById(doctorId);
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    await this.assertUsableCredentials(payload, doctor);
    await this.doctorManagementRepository.updateDoctor(doctorId, {
      fullName: payload.fullName,
      phoneNumber: payload.phoneNumber,
      title: payload.title,
      degrees: payload.degrees === undefined ? undefined : joinDegreeCodes(payload.degrees ?? []),
      educations: payload.educations,
    });
    await this.auditService.record({
      action: 'UPDATE',
      resource: DOCTOR_AUDIT_RESOURCE,
      resourceId: doctorId,
      actorUserId: currentUser.sub,
      metadata: {
        scope: 'OWN',
        fields: Object.keys(payload).filter(
          (field) => payload[field as keyof UpdateOwnDoctorProfileDto] !== undefined,
        ),
      },
    });
    return this.doctorManagementService.getDoctorById(doctorId, currentUser);
  }

  /**
   * The same catalog rule the administrative route applies: a code must name
   * a live option, except one the profile already stores, which stays
   * acceptable after the clinic deactivates it.
   */
  private async assertUsableCredentials(
    payload: UpdateOwnDoctorProfileDto,
    doctor: Pick<DoctorRecord, 'id' | 'title' | 'degrees'>,
  ): Promise<void> {
    if (payload.title) {
      await this.doctorCredentialOptionService.assertUsableCodes({
        kind: 'TITLE',
        codes: [payload.title],
        field: 'title',
        retainedCodes: doctor.title ? [doctor.title] : [],
      });
    }
    if (payload.degrees) {
      await this.doctorCredentialOptionService.assertUsableCodes({
        kind: 'DEGREE',
        codes: payload.degrees,
        field: 'degrees',
        retainedCodes: splitDegreeCodes(doctor.degrees),
      });
    }
    await this.assertUsableEducationFields(payload, doctor.id);
  }

  private async assertUsableEducationFields(
    payload: UpdateOwnDoctorProfileDto,
    doctorId: string,
  ): Promise<void> {
    if (!payload.educations) {
      return;
    }
    await this.doctorCredentialOptionService.assertUsableCodes({
      kind: 'FIELD_OF_STUDY',
      codes: payload.educations
        .map((education) => education.fieldOfStudy)
        .filter((code): code is string => Boolean(code)),
      field: 'educations.fieldOfStudy',
      retainedCodes: await this.doctorManagementRepository.listEducationFieldOfStudyCodes(doctorId),
    });
  }
}
