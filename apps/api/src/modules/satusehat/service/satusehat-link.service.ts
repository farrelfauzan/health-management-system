import {
  DoctorSatusehatLinkTarget,
  SatusehatDoctorIhsPreview,
  SatusehatDoctorLinkResult,
  SatusehatLinkAuditTarget,
  SatusehatPatientLinkResult,
  SatusehatPractitionerSummary,
} from '@hms/shared-types';
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatAmbiguousMatchError } from '../../../common/satusehat/satusehat-ambiguous-match.error';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatLinkRepository } from '../repository/satusehat-link.repository';
import { checkMaskedNikSuffix } from './check-masked-nik-suffix';

const PATIENT_AUDIT_RESOURCE = 'PatientProfile';
const DOCTOR_AUDIT_RESOURCE = 'DoctorProfile';

/**
 * Links local profiles to their Kemenkes IHS numbers via the SATUSEHAT master
 * patient / practitioner index. Linking is idempotent: an already linked
 * profile returns its current state without another upstream call, because an
 * IHS number is permanent — re-resolving it could only introduce a mismatch.
 */
@Injectable()
export class SatusehatLinkService {
  constructor(
    private readonly satusehatLinkRepository: SatusehatLinkRepository,
    private readonly masterDataClient: SatusehatMasterDataClient,
    private readonly auditService: AuditService,
  ) {}

  async linkPatient(patientId: string, currentUser: CurrentUser): Promise<SatusehatPatientLinkResult> {
    const target = await this.satusehatLinkRepository.findPatientLinkTarget(patientId);
    if (!target) {
      throw new NotFoundException('Patient not found');
    }
    if (target.hasSatusehatPatientId) {
      return { patientId, hasSatusehatPatientId: true, alreadyLinked: true };
    }
    const ihsNumber = await this.lookupPatientIhsNumber(target.nik, {
      resource: PATIENT_AUDIT_RESOURCE,
      resourceId: patientId,
      actorUserId: currentUser.sub,
    });
    await this.satusehatLinkRepository.savePatientIhsNumber({ patientId, ihsNumber });
    await this.auditService.record({
      action: 'SATUSEHAT_PATIENT_LINKED',
      resource: PATIENT_AUDIT_RESOURCE,
      resourceId: patientId,
      actorUserId: currentUser.sub,
      metadata: { lookup: 'NIK' },
    });
    return { patientId, hasSatusehatPatientId: true, alreadyLinked: false };
  }

  async linkDoctor(doctorId: string, currentUser: CurrentUser): Promise<SatusehatDoctorLinkResult> {
    const target = await this.satusehatLinkRepository.findDoctorLinkTarget(doctorId);
    if (!target) {
      throw new NotFoundException('Doctor not found');
    }
    if (target.satusehatPractitionerId !== null) {
      return {
        doctorId,
        satusehatPractitionerId: target.satusehatPractitionerId,
        alreadyLinked: true,
      };
    }
    const ihsNumber = await this.lookupPractitionerIhsNumber(target.nik, {
      resource: DOCTOR_AUDIT_RESOURCE,
      resourceId: doctorId,
      actorUserId: currentUser.sub,
    });
    await this.satusehatLinkRepository.saveDoctorIhsNumber({ doctorId, ihsNumber });
    await this.auditService.record({
      action: 'SATUSEHAT_DOCTOR_LINKED',
      resource: DOCTOR_AUDIT_RESOURCE,
      resourceId: doctorId,
      actorUserId: currentUser.sub,
      metadata: { lookup: 'NIK' },
    });
    return { doctorId, satusehatPractitionerId: ihsNumber, alreadyLinked: false };
  }

  /**
   * What SATUSEHAT holds under a hand-typed IHS number, for the operator to
   * confirm before anything is saved (P21-T08). The platform returns a name and
   * a NIK masked to its last three digits, with no gender and no birth date.
   * So the preview is the SATUSEHAT name beside ours, and whether the visible
   * digits agree.
   */
  async previewDoctorIhsLink(
    doctorId: string,
    ihsNumber: string,
    currentUser: CurrentUser,
  ): Promise<SatusehatDoctorIhsPreview> {
    const target = await this.findDoctorTargetForIhsLink(doctorId, ihsNumber);
    const practitioner = await this.readPractitionerOrThrow(
      ihsNumber,
      this.toDoctorAuditTarget(doctorId, currentUser),
    );
    return {
      doctorId,
      ihsNumber,
      doctorName: target.fullName,
      satusehatName: practitioner.name,
      nikSuffixCheck: checkMaskedNikSuffix({
        maskedNik: practitioner.maskedNik,
        storedNik: target.nik,
      }),
      alreadyLinked: target.satusehatPractitionerId === ihsNumber,
    };
  }

  /**
   * Saves a hand-typed IHS number after reading it back again: the preview the
   * operator saw is not trusted, because the id could have changed in between.
   * Refused when SATUSEHAT does not hold the id, or when its visible NIK digits
   * prove it is somebody else. Audited with `lookup: 'IHS_MANUAL'`, so the trail
   * says the link was made by hand.
   */
  async linkDoctorByIhs(
    doctorId: string,
    ihsNumber: string,
    currentUser: CurrentUser,
  ): Promise<SatusehatDoctorLinkResult> {
    const target = await this.findDoctorTargetForIhsLink(doctorId, ihsNumber);
    if (target.satusehatPractitionerId === ihsNumber) {
      return { doctorId, satusehatPractitionerId: ihsNumber, alreadyLinked: true };
    }
    const practitioner = await this.readPractitionerOrThrow(
      ihsNumber,
      this.toDoctorAuditTarget(doctorId, currentUser),
    );
    const nikSuffixCheck = checkMaskedNikSuffix({
      maskedNik: practitioner.maskedNik,
      storedNik: target.nik,
    });
    if (nikSuffixCheck === 'DIFFERS') {
      throw new ConflictException(
        "The NIK SATUSEHAT holds for this IHS number does not match the doctor's NIK; it belongs to a different practitioner",
      );
    }
    await this.satusehatLinkRepository.saveDoctorIhsNumber({ doctorId, ihsNumber });
    await this.auditService.record({
      action: 'SATUSEHAT_DOCTOR_LINKED',
      resource: DOCTOR_AUDIT_RESOURCE,
      resourceId: doctorId,
      actorUserId: currentUser.sub,
      metadata: { lookup: 'IHS_MANUAL' },
    });
    return { doctorId, satusehatPractitionerId: ihsNumber, alreadyLinked: false };
  }

  /**
   * A doctor already linked to a different IHS number is refused, not relinked.
   * An IHS number is permanent, and silently replacing one would move the
   * provenance of every earlier encounter. A link made from a wrong NIK is
   * cleared by correcting the NIK (D-035), which routes the doctor back here.
   */
  private async findDoctorTargetForIhsLink(
    doctorId: string,
    ihsNumber: string,
  ): Promise<DoctorSatusehatLinkTarget> {
    const target = await this.satusehatLinkRepository.findDoctorLinkTarget(doctorId);
    if (!target) {
      throw new NotFoundException('Doctor not found');
    }
    if (target.satusehatPractitionerId !== null && target.satusehatPractitionerId !== ihsNumber) {
      throw new ConflictException('Doctor is already linked to a different SATUSEHAT practitioner');
    }
    return target;
  }

  private async readPractitionerOrThrow(
    ihsNumber: string,
    profile: SatusehatLinkAuditTarget,
  ): Promise<SatusehatPractitionerSummary> {
    const practitioner = await this.resolveUpstream(
      () => this.masterDataClient.findPractitionerById(ihsNumber),
      profile,
    );
    if (practitioner === null) {
      throw new NotFoundException(
        'SATUSEHAT holds no practitioner with this IHS number; check the number in the SATUSEHAT portal',
      );
    }
    return practitioner;
  }

  private toDoctorAuditTarget(doctorId: string, currentUser: CurrentUser): SatusehatLinkAuditTarget {
    return { resource: DOCTOR_AUDIT_RESOURCE, resourceId: doctorId, actorUserId: currentUser.sub };
  }

  private async lookupPatientIhsNumber(
    nik: string | null,
    profile: SatusehatLinkAuditTarget,
  ): Promise<string> {
    if (nik === null) {
      throw new UnprocessableEntityException(
        'Patient has no NIK on record; add the NIK before linking to SATUSEHAT',
      );
    }
    const ihsNumber = await this.resolveUpstream(
      () => this.masterDataClient.findPatientIhsNumberByNik(nik),
      profile,
    );
    if (ihsNumber === null) {
      throw new NotFoundException('No SATUSEHAT patient record matches the stored NIK');
    }
    return ihsNumber;
  }

  private async lookupPractitionerIhsNumber(
    nik: string | null,
    profile: SatusehatLinkAuditTarget,
  ): Promise<string> {
    if (nik === null) {
      throw new UnprocessableEntityException(
        'Doctor has no NIK on record; add the NIK before linking to SATUSEHAT',
      );
    }
    const ihsNumber = await this.resolveUpstream(
      () => this.masterDataClient.findPractitionerIhsNumberByNik(nik),
      profile,
    );
    if (ihsNumber === null) {
      throw new NotFoundException('No SATUSEHAT practitioner record matches the stored NIK');
    }
    return ihsNumber;
  }

  private async resolveUpstream<T>(
    sendLookup: () => Promise<T>,
    profile: SatusehatLinkAuditTarget,
  ): Promise<T> {
    try {
      return await sendLookup();
    } catch (caughtError) {
      if (caughtError instanceof SatusehatAmbiguousMatchError) {
        await this.recordAmbiguousMatch(profile, caughtError.matchCount);
      }
      throw this.mapSatusehatFailure(caughtError, profile);
    }
  }

  /**
   * A refused link is worth recording precisely because nothing changed: the
   * next person to ask why a patient is still unlinked needs the count and the
   * moment, not an absence. The NIK is never part of the trail.
   */
  private async recordAmbiguousMatch(
    profile: SatusehatLinkAuditTarget,
    matchCount: number,
  ): Promise<void> {
    await this.auditService.record({
      action: 'SATUSEHAT_LINK_AMBIGUOUS',
      resource: profile.resource,
      resourceId: profile.resourceId,
      actorUserId: profile.actorUserId,
      metadata: { lookup: 'NIK', trigger: 'LINK_ENDPOINT', matchCount },
    });
  }

  private mapSatusehatFailure(caughtError: unknown, profile: SatusehatLinkAuditTarget): unknown {
    if (!(caughtError instanceof SatusehatError)) {
      return caughtError;
    }
    if (caughtError.code === 'SATUSEHAT_AMBIGUOUS_MATCH') {
      return new ConflictException(
        `SATUSEHAT returned more than one match for this NIK; verify the ${this.describeLinkSubject(profile)} in the SATUSEHAT portal before linking`,
      );
    }
    if (caughtError.code === 'SATUSEHAT_NOT_CONFIGURED') {
      return new ServiceUnavailableException(
        'SATUSEHAT integration is not configured for this deployment',
      );
    }
    if (caughtError.code === 'SATUSEHAT_UNAUTHORIZED') {
      return new BadGatewayException('SATUSEHAT rejected the clinic credentials');
    }
    return new BadGatewayException('SATUSEHAT is unreachable; try again later');
  }

  /**
   * Who the operator must go and verify. The 409 used to say "patient" on the
   * doctor route too, sending the front desk to the wrong record in the portal.
   */
  private describeLinkSubject(profile: SatusehatLinkAuditTarget): string {
    return profile.resource === DOCTOR_AUDIT_RESOURCE ? 'practitioner' : 'patient';
  }
}
