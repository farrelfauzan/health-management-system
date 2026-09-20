import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { PatientManagementRepository } from '../repository/patient-management.repository';

const AUDIT_RESOURCE = 'PatientProfile';
/** Shown to the admin beside the saved NIK when the platform refused it. */
const REJECTED_WARNING_PREFIX = 'SATUSEHAT menolak NIK bayi ini';
/** Shown when the platform could not be reached, so the outcome is unknown. */
const UNCONFIRMED_WARNING =
  'NIK tersimpan, tetapi pembaruan ke SATUSEHAT belum dapat dipastikan. Periksa data pasien di SATUSEHAT sebelum mengirim ulang.';

/**
 * Sends a newborn's first NIK to the SATUSEHAT Patient she was created as,
 * keeping the IHS number the platform assigned her (P24-T13, FR-NB-05).
 *
 * This runs **after** the local write and never undoes it: the NIK the family
 * brought to the counter is recorded whatever the platform says, and a
 * rejection comes back as a warning the admin reads, not as a failed request.
 * That is the ticket's rule, and it is also the only safe one — Dukcapil
 * disagreeing with a name is not a reason to lose the identifier.
 */
@Injectable()
export class NewbornSatusehatNikService {
  private readonly logger = new Logger(NewbornSatusehatNikService.name);

  constructor(
    private readonly patientManagementRepository: PatientManagementRepository,
    private readonly masterDataClient: SatusehatMasterDataClient,
    private readonly fhirMapper: SatusehatFhirMapper,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Returns the warning to show the admin, or null when the platform took the
   * patch. Never throws: the caller has already committed the NIK.
   */
  async sendFirstNik(patientId: string, actorUserId: string): Promise<string | null> {
    const target = await this.patientManagementRepository.findNewbornNikPatchTarget(patientId);
    if (target === null) {
      return null;
    }
    const operations = this.fhirMapper.mapNewbornNikToPatientPatch({
      nik: target.nik,
      fullName: target.fullName,
      birthDate: target.birthDate,
    });
    try {
      await this.masterDataClient.patchPatient(target.ihsNumber, operations);
    } catch (caughtError) {
      return this.reportFailure(patientId, actorUserId, caughtError);
    }
    await this.recordOutcome(patientId, actorUserId, { outcome: 'SENT' });
    return null;
  }

  /**
   * A refusal and an outage read the same to the caller — the NIK is saved,
   * the platform is not updated — but they are different things to whoever
   * picks this up later, so the audit row and the message keep them apart.
   * The platform's own reason is passed through: it names the field Dukcapil
   * disagreed with, which is what the desk needs to correct.
   */
  private async reportFailure(
    patientId: string,
    actorUserId: string,
    caughtError: unknown,
  ): Promise<string> {
    if (!(caughtError instanceof SatusehatError)) {
      throw caughtError;
    }
    const isRejection = caughtError.code === 'SATUSEHAT_REQUEST_REJECTED';
    await this.recordOutcome(patientId, actorUserId, {
      outcome: isRejection ? 'REJECTED' : 'UNCONFIRMED',
      errorCode: caughtError.code,
    });
    this.logger.warn(
      `Newborn NIK patch for patient ${patientId} did not land: ${caughtError.code}`,
    );
    return isRejection ? `${REJECTED_WARNING_PREFIX}: ${caughtError.message}` : UNCONFIRMED_WARNING;
  }

  /** The NIK is never part of the trail — only what happened to it. */
  private async recordOutcome(
    patientId: string,
    actorUserId: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.auditService.record({
      action: 'SATUSEHAT_PATIENT_NIK_PATCHED',
      resource: AUDIT_RESOURCE,
      resourceId: patientId,
      actorUserId,
      metadata: { ...metadata, trigger: 'NEWBORN_FIRST_NIK' },
    });
  }
}
