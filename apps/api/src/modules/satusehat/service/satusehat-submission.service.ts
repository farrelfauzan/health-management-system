import { randomUUID } from 'node:crypto';

import { SatusehatSubmissionBundleData, SatusehatSubmissionRecord } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import {
  SatusehatFhirBundleEntry,
  SatusehatFhirTransactionBundle,
  SatusehatTransactionResponse,
} from '../../../common/satusehat/satusehat-fhir.types';
import { SatusehatHttpClient } from '../../../common/satusehat/satusehat-http.client';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { SatusehatConfig } from '../../../common/satusehat/satusehat.types';
import { SatusehatLinkRepository } from '../repository/satusehat-link.repository';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionDataError } from './satusehat-submission-data.error';

const PERMANENT_ERROR_CODES: readonly string[] = [
  'SATUSEHAT_NOT_CONFIGURED',
  'SATUSEHAT_UNAUTHORIZED',
  'SATUSEHAT_REQUEST_REJECTED',
];
const MAX_STORED_ERROR_LENGTH = 500;

/**
 * Processes one outbox row end to end: rebuilds the encounter bundle from the
 * live clinical record, resolves (or automatically links) the patient and
 * practitioner IHS numbers, posts the transaction bundle, and records the
 * outcome. Transient upstream failures reschedule with exponential backoff up
 * to the attempt cap; data problems and permanent upstream rejections settle
 * the row as FAILED for the admin retry surface (P10-T06).
 */
@Injectable()
export class SatusehatSubmissionService {
  private readonly logger = new Logger(SatusehatSubmissionService.name);
  private readonly satusehatConfig: SatusehatConfig;

  constructor(
    configService: ConfigService,
    private readonly submissionRepository: SatusehatSubmissionRepository,
    private readonly linkRepository: SatusehatLinkRepository,
    private readonly masterDataClient: SatusehatMasterDataClient,
    private readonly fhirMapper: SatusehatFhirMapper,
    private readonly httpClient: SatusehatHttpClient,
    private readonly auditService: AuditService,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  async processSubmission(submission: SatusehatSubmissionRecord): Promise<void> {
    const attemptNumber = submission.attempts + 1;
    try {
      const satusehatEncounterId = await this.submitEncounterBundle(submission.encounterId);
      await this.submissionRepository.markSubmitted(submission.id, satusehatEncounterId);
      this.logger.log(
        `Submitted encounter ${submission.encounterId} to SATUSEHAT as ${satusehatEncounterId ?? 'unknown id'}`,
      );
    } catch (caughtError) {
      await this.recordFailure(submission, attemptNumber, caughtError);
    }
  }

  private async submitEncounterBundle(encounterId: string): Promise<string | null> {
    const bundleData = await this.submissionRepository.findBundleData(encounterId);
    if (!bundleData) {
      throw new SatusehatSubmissionDataError('Encounter no longer exists');
    }
    if (bundleData.encounterStatus !== 'FINISHED' || bundleData.endedAt === null) {
      throw new SatusehatSubmissionDataError(
        `Encounter is ${bundleData.encounterStatus}; only finished encounters are reported`,
      );
    }
    const patientIhsNumber = await this.resolvePatientIhsNumber(bundleData);
    const practitionerIhsNumber = await this.resolvePractitionerIhsNumber(bundleData);
    const bundle = this.buildTransactionBundle(
      bundleData,
      bundleData.endedAt,
      patientIhsNumber,
      practitionerIhsNumber,
    );
    const response = await this.httpClient.sendRequest<SatusehatTransactionResponse>({
      method: 'POST',
      path: '',
      body: bundle,
    });
    return this.extractEncounterIhsId(response);
  }

  private buildTransactionBundle(
    bundleData: SatusehatSubmissionBundleData,
    endedAt: Date,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
  ): SatusehatFhirTransactionBundle {
    const encounterFullUrl = `urn:uuid:${randomUUID()}`;
    const conditionEntries: SatusehatFhirBundleEntry[] = this.sortDiagnoses(bundleData).map(
      (diagnosis) => ({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: this.fhirMapper.mapDiagnosisToCondition({
          icd10Code: diagnosis.code,
          icd10Display: diagnosis.display,
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference: encounterFullUrl,
          recordedAt: diagnosis.recordedAt,
        }),
        request: { method: 'POST', url: 'Condition' },
      }),
    );
    const observationEntries: SatusehatFhirBundleEntry[] = bundleData.latestVitalSigns
      ? this.fhirMapper
          .mapVitalSignsToObservations({
            ...bundleData.latestVitalSigns,
            patientIhsNumber,
            practitionerIhsNumber,
            encounterReference: encounterFullUrl,
          })
          .map((observation) => ({
            fullUrl: `urn:uuid:${randomUUID()}`,
            resource: observation,
            request: { method: 'POST', url: 'Observation' },
          }))
      : [];
    const encounterResource = this.fhirMapper.mapEncounter({
      encounterId: bundleData.encounterId,
      patientIhsNumber,
      patientName: bundleData.patientName,
      practitionerIhsNumber,
      practitionerName: bundleData.doctorName,
      arrivedAt: bundleData.arrivedAt,
      startedAt: bundleData.startedAt,
      endedAt,
      conditionReferences: conditionEntries.map((entry, index) => ({
        reference: entry.fullUrl,
        rank: index + 1,
      })),
    });
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        { fullUrl: encounterFullUrl, resource: encounterResource, request: { method: 'POST', url: 'Encounter' } },
        ...conditionEntries,
        ...observationEntries,
      ],
    };
  }

  /** PRIMARY first (rank 1), then secondaries in the order they were recorded. */
  private sortDiagnoses(bundleData: SatusehatSubmissionBundleData) {
    return [...bundleData.diagnoses].sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'PRIMARY' ? -1 : 1;
      }
      return left.recordedAt.getTime() - right.recordedAt.getTime();
    });
  }

  private async resolvePatientIhsNumber(
    bundleData: SatusehatSubmissionBundleData,
  ): Promise<string> {
    if (bundleData.patientIhsNumber) {
      return bundleData.patientIhsNumber;
    }
    const target = await this.linkRepository.findPatientLinkTarget(bundleData.patientId);
    if (!target || target.nik === null) {
      throw new SatusehatSubmissionDataError(
        'Patient has no NIK on record, so the IHS number cannot be resolved',
      );
    }
    const ihsNumber = await this.masterDataClient.findPatientIhsNumberByNik(target.nik);
    if (ihsNumber === null) {
      throw new SatusehatSubmissionDataError('No SATUSEHAT patient record matches the stored NIK');
    }
    await this.linkRepository.savePatientIhsNumber({
      patientId: bundleData.patientId,
      ihsNumber,
    });
    await this.auditService.record({
      action: 'SATUSEHAT_PATIENT_LINKED',
      resource: 'PatientProfile',
      resourceId: bundleData.patientId,
      actorUserId: null,
      metadata: { lookup: 'NIK', trigger: 'SUBMISSION_WORKER' },
    });
    return ihsNumber;
  }

  private async resolvePractitionerIhsNumber(
    bundleData: SatusehatSubmissionBundleData,
  ): Promise<string> {
    if (bundleData.practitionerIhsNumber) {
      return bundleData.practitionerIhsNumber;
    }
    const target = await this.linkRepository.findDoctorLinkTarget(bundleData.doctorId);
    if (!target || target.nik === null) {
      throw new SatusehatSubmissionDataError(
        'Doctor has no NIK on record, so the IHS practitioner number cannot be resolved',
      );
    }
    const ihsNumber = await this.masterDataClient.findPractitionerIhsNumberByNik(target.nik);
    if (ihsNumber === null) {
      throw new SatusehatSubmissionDataError(
        'No SATUSEHAT practitioner record matches the stored NIK',
      );
    }
    await this.linkRepository.saveDoctorIhsNumber({ doctorId: bundleData.doctorId, ihsNumber });
    await this.auditService.record({
      action: 'SATUSEHAT_DOCTOR_LINKED',
      resource: 'DoctorProfile',
      resourceId: bundleData.doctorId,
      actorUserId: null,
      metadata: { lookup: 'NIK', trigger: 'SUBMISSION_WORKER' },
    });
    return ihsNumber;
  }

  private extractEncounterIhsId(response: SatusehatTransactionResponse): string | null {
    const encounterEntry = response.entry?.find(
      (entry) =>
        (typeof entry.response?.location === 'string' &&
          entry.response.location.startsWith('Encounter/')) ||
        entry.resource?.resourceType === 'Encounter',
    );
    if (!encounterEntry) {
      return null;
    }
    const location = encounterEntry.response?.location;
    if (typeof location === 'string') {
      const segments = location.split('/');
      return segments[1] ?? null;
    }
    const resourceId = encounterEntry.resource?.id;
    return typeof resourceId === 'string' ? resourceId : null;
  }

  private async recordFailure(
    submission: SatusehatSubmissionRecord,
    attemptNumber: number,
    caughtError: unknown,
  ): Promise<void> {
    const message = this.describeError(caughtError);
    const isPermanent =
      caughtError instanceof SatusehatSubmissionDataError ||
      (caughtError instanceof SatusehatError && PERMANENT_ERROR_CODES.includes(caughtError.code));
    if (isPermanent || attemptNumber >= this.satusehatConfig.submissionMaxAttempts) {
      await this.submissionRepository.markFailed({
        id: submission.id,
        attempts: attemptNumber,
        lastError: message,
      });
      this.logger.warn(
        `SATUSEHAT submission for encounter ${submission.encounterId} failed permanently after attempt ${attemptNumber}: ${message}`,
      );
      return;
    }
    const delayMs = this.satusehatConfig.submissionRetryBaseDelayMs * 2 ** (attemptNumber - 1);
    await this.submissionRepository.scheduleRetry({
      id: submission.id,
      attempts: attemptNumber,
      nextAttemptAt: new Date(Date.now() + delayMs),
      lastError: message,
    });
    this.logger.warn(
      `SATUSEHAT submission for encounter ${submission.encounterId} attempt ${attemptNumber} failed transiently: ${message}`,
    );
  }

  private describeError(caughtError: unknown): string {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    return message.slice(0, MAX_STORED_ERROR_LENGTH);
  }
}
