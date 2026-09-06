import { randomUUID } from 'node:crypto';

import {
  SatusehatSubmissionBundleData,
  SatusehatSubmissionMedication,
  SatusehatSubmissionRecord,
} from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import {
  SatusehatFhirBundleEntry,
  SatusehatFhirTransactionBundle,
  SatusehatTransactionResponse,
} from '../../../common/satusehat/satusehat-fhir.types';
import { SatusehatAmbiguousMatchError } from '../../../common/satusehat/satusehat-ambiguous-match.error';
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
 * Captures the Encounter id from a transaction-response `location`. The
 * platform answers with an absolute URL
 * (`https://…/fhir-r4/v1/Encounter/<id>/_history/<version>`) even though FHIR
 * also permits the relative `Encounter/<id>/_history/<version>` form, so the
 * match anchors on a path-segment boundary and accepts both. Declared without
 * the global flag on purpose: a `/g` regex carries `lastIndex` between
 * `test` and `exec` calls and would skip every other match.
 */
const ENCOUNTER_LOCATION_PATTERN = /(?:^|\/)Encounter\/([^/?#]+)/;

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
      this.logger.log('SATUSEHAT encounter submission succeeded');
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
    const medicationEntries = this.buildMedicationEntries(
      bundleData,
      encounterFullUrl,
      patientIhsNumber,
      practitionerIhsNumber,
    );
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
        ...medicationEntries,
      ],
    };
  }

  /**
   * Builds Medication, MedicationRequest, and MedicationDispense entries for
   * every KFA-coded item on the visit's prescriptions and dispense records.
   * Items whose catalog row has no `kfaCode` are skipped — the platform only
   * accepts KFA-coded products — and reported as a gap log so the catalog gap
   * is fixable instead of silently shrinking the submission (P10-T05).
   */
  private buildMedicationEntries(
    bundleData: SatusehatSubmissionBundleData,
    encounterFullUrl: string,
    patientIhsNumber: string,
    practitionerIhsNumber: string,
  ): SatusehatFhirBundleEntry[] {
    const medicationFullUrls = new Map<string, string>();
    const medicationEntries: SatusehatFhirBundleEntry[] = [];
    const skippedMedications = new Map<string, SatusehatSubmissionMedication>();
    const registerMedication = (medication: SatusehatSubmissionMedication): string | null => {
      if (medication.kfaCode === null) {
        skippedMedications.set(medication.medicationId, medication);
        return null;
      }
      const existingFullUrl = medicationFullUrls.get(medication.medicationId);
      if (existingFullUrl) {
        return existingFullUrl;
      }
      const fullUrl = `urn:uuid:${randomUUID()}`;
      medicationFullUrls.set(medication.medicationId, fullUrl);
      medicationEntries.push({
        fullUrl,
        resource: this.fhirMapper.mapMedicationToResource({
          medicationCode: medication.code,
          kfaCode: medication.kfaCode,
          name: medication.name,
        }),
        request: { method: 'POST', url: 'Medication' },
      });
      return fullUrl;
    };
    const requestFullUrls = new Map<string, string>();
    const requestEntries: SatusehatFhirBundleEntry[] = [];
    for (const prescription of bundleData.prescriptions) {
      for (const item of prescription.items) {
        const medicationFullUrl = registerMedication(item.medication);
        if (medicationFullUrl === null) {
          continue;
        }
        const requestFullUrl = `urn:uuid:${randomUUID()}`;
        requestFullUrls.set(`${item.prescriptionId}:${item.medication.medicationId}`, requestFullUrl);
        requestEntries.push({
          fullUrl: requestFullUrl,
          resource: this.fhirMapper.mapPrescriptionItemToMedicationRequest({
            prescriptionId: item.prescriptionId,
            prescriptionItemId: item.prescriptionItemId,
            medicationReference: medicationFullUrl,
            medicationDisplay: item.medication.name,
            patientIhsNumber,
            patientName: bundleData.patientName,
            practitionerIhsNumber,
            practitionerName: bundleData.doctorName,
            encounterReference: encounterFullUrl,
            dosage: item.dosage,
            frequency: item.frequency,
            instructions: item.instructions ?? undefined,
            quantity: item.quantity,
            unit: item.medication.unit ?? undefined,
            authoredOn: prescription.issuedAt ?? undefined,
          }),
          request: { method: 'POST', url: 'MedicationRequest' },
        });
      }
    }
    const dispenseEntries: SatusehatFhirBundleEntry[] = [];
    for (const dispenseItem of bundleData.dispenseItems) {
      const medicationFullUrl = registerMedication(dispenseItem.medication);
      if (medicationFullUrl === null) {
        continue;
      }
      dispenseEntries.push({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: this.fhirMapper.mapDispenseItemToMedicationDispense({
          dispenseRecordId: dispenseItem.dispenseRecordId,
          dispenseItemId: dispenseItem.dispenseItemId,
          medicationReference: medicationFullUrl,
          medicationDisplay: dispenseItem.medication.name,
          patientIhsNumber,
          patientName: bundleData.patientName,
          encounterReference: encounterFullUrl,
          medicationRequestReference: requestFullUrls.get(
            `${dispenseItem.prescriptionId}:${dispenseItem.medication.medicationId}`,
          ),
          quantity: dispenseItem.quantity,
          unit: dispenseItem.medication.unit ?? undefined,
          dispensedAt: dispenseItem.dispensedAt,
        }),
        request: { method: 'POST', url: 'MedicationDispense' },
      });
    }
    this.reportMedicationGaps(skippedMedications);
    return [...medicationEntries, ...requestEntries, ...dispenseEntries];
  }

  private reportMedicationGaps(
    skippedMedications: ReadonlyMap<string, SatusehatSubmissionMedication>,
  ): void {
    if (skippedMedications.size === 0) {
      return;
    }
    this.logger.warn(
      `SATUSEHAT medication mapping gap: skipped ${skippedMedications.size} item(s) without a KFA code`,
    );
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
          ENCOUNTER_LOCATION_PATTERN.test(entry.response.location)) ||
        entry.resource?.resourceType === 'Encounter',
    );
    if (!encounterEntry) {
      return null;
    }
    const location = encounterEntry.response?.location;
    if (typeof location === 'string') {
      const matchedIhsId = ENCOUNTER_LOCATION_PATTERN.exec(location)?.[1];
      if (matchedIhsId !== undefined && matchedIhsId !== '') {
        return matchedIhsId;
      }
    }
    const resourceId = encounterEntry.resource?.id;
    return typeof resourceId === 'string' ? resourceId : null;
  }

  private async recordFailure(
    submission: SatusehatSubmissionRecord,
    attemptNumber: number,
    caughtError: unknown,
  ): Promise<void> {
    if (caughtError instanceof SatusehatAmbiguousMatchError) {
      await this.parkAmbiguousMatch(submission, caughtError);
      return;
    }
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
        `SATUSEHAT submission failed permanently after attempt ${attemptNumber}`,
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
      `SATUSEHAT submission attempt ${attemptNumber} failed transiently`,
    );
  }

  /**
   * Ambiguity is not a failed attempt — it is a refusal. Retrying cannot
   * resolve which of the matching national records is the right one, and the
   * platform masks NIK so the code can never re-verify; a human has to settle
   * it in the SATUSEHAT portal. The row is parked FAILED for the admin retry
   * surface with the attempt budget untouched, so once the ambiguity is
   * resolved upstream the operator still has every retry available.
   */
  private async parkAmbiguousMatch(
    submission: SatusehatSubmissionRecord,
    ambiguousMatchError: SatusehatAmbiguousMatchError,
  ): Promise<void> {
    await this.submissionRepository.markFailed({
      id: submission.id,
      attempts: submission.attempts,
      lastError: this.describeError(ambiguousMatchError),
    });
    await this.auditService.record({
      action: 'SATUSEHAT_LINK_AMBIGUOUS',
      resource: 'SatusehatSubmission',
      resourceId: submission.id,
      actorUserId: null,
      metadata: {
        lookup: 'NIK',
        trigger: 'SUBMISSION_WORKER',
        matchCount: ambiguousMatchError.matchCount,
      },
    });
    this.logger.warn('SATUSEHAT submission refused: the NIK matched more than one record');
  }

  private describeError(caughtError: unknown): string {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    return message.slice(0, MAX_STORED_ERROR_LENGTH);
  }
}
