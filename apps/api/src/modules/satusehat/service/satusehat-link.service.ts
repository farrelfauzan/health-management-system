import {
  SatusehatDoctorLinkResult,
  SatusehatPatientLinkResult,
} from '@hms/shared-types';
import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatLinkRepository } from '../repository/satusehat-link.repository';

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
    const ihsNumber = await this.lookupPatientIhsNumber(target.nik);
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
    const ihsNumber = await this.lookupPractitionerIhsNumber(target.nik);
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

  private async lookupPatientIhsNumber(nik: string | null): Promise<string> {
    if (nik === null) {
      throw new UnprocessableEntityException(
        'Patient has no NIK on record; add the NIK before linking to SATUSEHAT',
      );
    }
    const ihsNumber = await this.resolveUpstream(() =>
      this.masterDataClient.findPatientIhsNumberByNik(nik),
    );
    if (ihsNumber === null) {
      throw new NotFoundException('No SATUSEHAT patient record matches the stored NIK');
    }
    return ihsNumber;
  }

  private async lookupPractitionerIhsNumber(nik: string | null): Promise<string> {
    if (nik === null) {
      throw new UnprocessableEntityException(
        'Doctor has no NIK on record; add the NIK before linking to SATUSEHAT',
      );
    }
    const ihsNumber = await this.resolveUpstream(() =>
      this.masterDataClient.findPractitionerIhsNumberByNik(nik),
    );
    if (ihsNumber === null) {
      throw new NotFoundException('No SATUSEHAT practitioner record matches the stored NIK');
    }
    return ihsNumber;
  }

  private async resolveUpstream<T>(sendLookup: () => Promise<T>): Promise<T> {
    try {
      return await sendLookup();
    } catch (caughtError) {
      throw this.mapSatusehatFailure(caughtError);
    }
  }

  private mapSatusehatFailure(caughtError: unknown): unknown {
    if (!(caughtError instanceof SatusehatError)) {
      return caughtError;
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
}
