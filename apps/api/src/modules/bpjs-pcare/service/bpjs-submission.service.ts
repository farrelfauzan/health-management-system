import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  BpjsSubmissionDoctorData,
  BpjsSubmissionRecord,
  BpjsSubmissionSourceData,
} from '@hms/shared-types';

import { BpjsPcareHttpClient } from '../../../common/bpjs-pcare/bpjs-pcare-http.client';
import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import {
  BpjsPcareAdapterConfig,
  BpjsPcareConnection,
  BpjsPcareErrorCode,
} from '../../../common/bpjs-pcare/bpjs-pcare.types';
import { buildBpjsKunjunganPayload } from '../../../common/bpjs-pcare/build-bpjs-kunjungan-payload';
import { buildBpjsObatPayload } from '../../../common/bpjs-pcare/build-bpjs-obat-payload';
import { buildBpjsPendaftaranDeletePath } from '../../../common/bpjs-pcare/build-bpjs-pendaftaran-delete-path';
import { buildBpjsPendaftaranPayload } from '../../../common/bpjs-pcare/build-bpjs-pendaftaran-payload';
import { resolveBpjsPcareAdapterConfig } from '../../../common/bpjs-pcare/bpjs-pcare.config';
import { parseBpjsPcareSubmissionReference } from '../../../common/bpjs-pcare/parse-bpjs-pcare-submission-reference';
import { BpjsAntreanSubmissionService } from '../../bpjs-antrean/service/bpjs-antrean-submission.service';
import { BpjsPcareConfigRepository } from '../repository/bpjs-pcare-config.repository';
import { BpjsSubmissionRepository } from '../repository/bpjs-submission.repository';
import { BpjsSubmissionDataError } from './bpjs-submission-data.error';

const PERMANENT_ERROR_CODES: readonly BpjsPcareErrorCode[] = [
  'BPJS_PCARE_NOT_CONFIGURED',
  'BPJS_PCARE_UNAUTHORIZED',
  'BPJS_PCARE_REQUEST_REJECTED',
];
const MAX_STORED_ERROR_LENGTH = 500;
const ANTREAN_SUBMISSION_TYPES: readonly BpjsSubmissionRecord['type'][] = [
  'ANTREAN_ADD',
  'ANTREAN_PANGGIL',
  'ANTREAN_BATAL',
];

type BpjsSubmissionOutcome = {
  bpjsReferenceNo: string | null;
  submittedKdPoli: string | null;
};

/**
 * Drains the BPJS submission outbox (P11-T05, extended by P14-T05), mirroring
 * the SATUSEHAT
 * submission service: an attempt either settles the row SUBMITTED, schedules
 * an exponential-backoff retry, or fails it permanently. Data errors
 * (missing mappings, missing primary diagnosis, cancelled registrations)
 * fail immediately with a message written for the submissions monitor —
 * retrying cannot fix data. One deliberate difference from SATUSEHAT: a
 * walk-in checked in without an appointment has no doctor yet, so an
 * unresolvable poli at pendaftaran time is a *transient* error — the doctor
 * arrives when the encounter opens, so time fixes it where the retry budget
 * allows. {@link processSubmission} never throws: the worker and the ops
 * retry endpoint both rely on that.
 *
 * Since P14-T05 this service drains **two** BPJS integrations. The Antrean
 * types are delegated to {@link BpjsAntreanSubmissionService} for payload
 * building and transport — they sign with different credentials and run on
 * their own circuit breaker — while the outbox bookkeeping stays here, so
 * there is exactly one retry policy, one worker and one monitor for both.
 * Splitting the bookkeeping would mean two backoff curves to keep in step,
 * which is the failure mode §4.4 of the evaluation set out to avoid.
 */
@Injectable()
export class BpjsSubmissionService {
  private readonly logger = new Logger(BpjsSubmissionService.name);
  private readonly adapterConfig: BpjsPcareAdapterConfig;
  constructor(
    private readonly submissionRepository: BpjsSubmissionRepository,
    private readonly configRepository: BpjsPcareConfigRepository,
    private readonly httpClient: BpjsPcareHttpClient,
    private readonly antreanSubmissionService: BpjsAntreanSubmissionService,
    configService: ConfigService,
  ) {
    this.adapterConfig = resolveBpjsPcareAdapterConfig(configService);
  }

  async processSubmission(submission: BpjsSubmissionRecord): Promise<void> {
    const attemptNumber = submission.attempts + 1;
    try {
      const outcome = await this.submitByType(submission);
      await this.submissionRepository.markSubmitted({ id: submission.id, ...outcome });
      if (submission.type === 'PENDAFTARAN') {
        await this.propagateLateCancellation(submission.registrationId);
      }
    } catch (caughtError) {
      await this.recordFailure(submission, attemptNumber, caughtError);
    }
  }

  private async submitByType(submission: BpjsSubmissionRecord): Promise<BpjsSubmissionOutcome> {
    const sourceData = await this.submissionRepository.findSubmissionSourceData(
      submission.registrationId,
    );
    if (sourceData === null) {
      throw new BpjsSubmissionDataError('Registration no longer exists');
    }
    if (submission.type === 'PENDAFTARAN') {
      return this.submitPendaftaran(sourceData);
    }
    if (submission.type === 'KUNJUNGAN') {
      return this.submitKunjungan(sourceData);
    }
    if (submission.type === 'OBAT') {
      return this.submitObat(sourceData);
    }
    if (this.isAntreanSubmission(submission.type)) {
      return this.antreanSubmissionService.submit(submission.type, sourceData);
    }
    return this.submitPendaftaranDelete(sourceData);
  }

  private async submitPendaftaran(
    sourceData: BpjsSubmissionSourceData,
  ): Promise<BpjsSubmissionOutcome> {
    if (sourceData.registration.status === 'CANCELLED') {
      throw new BpjsSubmissionDataError(
        'Registration was cancelled before the pendaftaran was sent — nothing to register',
      );
    }
    const noKartu = this.requireBpjsNumber(sourceData);
    const doctor = sourceData.appointmentDoctor ?? sourceData.encounter?.doctor ?? null;
    if (doctor === null) {
      throw new Error(
        'Registration has no doctor yet (walk-in without an appointment) — retried until the encounter opens',
      );
    }
    const kdPoli = this.requirePoliCode(doctor);
    const registrationDate = this.requireRegistrationDate(sourceData);
    const configRecord = await this.requireConfigRecord();
    const payload = buildBpjsPendaftaranPayload({
      kdProviderPeserta: configRecord.kdProviderPpk,
      noKartu,
      kdPoli,
      registrationDate,
      keluhan: sourceData.encounter?.subjective ?? null,
    });
    const connection = await this.requireConnection();
    const envelope = await this.httpClient.sendRequest(connection, {
      method: 'POST',
      path: 'pendaftaran',
      body: payload,
    });
    return {
      bpjsReferenceNo: parseBpjsPcareSubmissionReference(envelope.response),
      submittedKdPoli: kdPoli,
    };
  }

  private async submitKunjungan(
    sourceData: BpjsSubmissionSourceData,
  ): Promise<BpjsSubmissionOutcome> {
    if (sourceData.registration.status === 'CANCELLED') {
      throw new BpjsSubmissionDataError(
        'Registration was cancelled — the kunjungan will not be reported',
      );
    }
    const encounter = sourceData.encounter;
    if (encounter === null) {
      throw new BpjsSubmissionDataError('Encounter no longer exists');
    }
    if (encounter.status !== 'FINISHED' || encounter.endedAt === null) {
      throw new BpjsSubmissionDataError('Encounter is not finished');
    }
    this.assertPendaftaranSettled(sourceData);
    const noKartu = this.requireBpjsNumber(sourceData);
    const doctor = encounter.doctor;
    if (doctor === null) {
      throw new BpjsSubmissionDataError('Encounter has no doctor');
    }
    if (doctor.bpjsDoctorCode === null) {
      throw new BpjsSubmissionDataError(
        `Doctor ${doctor.fullName} has no BPJS kdDokter mapping — map the doctor in BPJS mappings first`,
      );
    }
    const kdPoli = sourceData.pendaftaran?.submittedKdPoli ?? this.requirePoliCode(doctor);
    const diagnosisCodes = encounter.diagnoses.map((diagnosis) => diagnosis.code);
    if (encounter.diagnoses[0]?.type !== 'PRIMARY') {
      throw new BpjsSubmissionDataError(
        'Encounter has no primary diagnosis — record a coded primary diagnosis before the kunjungan can be reported',
      );
    }
    const payload = buildBpjsKunjunganPayload({
      noKartu,
      kdPoli,
      kdDokter: doctor.bpjsDoctorCode,
      registrationDate: this.requireRegistrationDate(sourceData),
      dischargeDate: encounter.endedAt,
      keluhan: encounter.subjective,
      diagnosisCodes,
      vitals: encounter.vitals,
      referral: encounter.referral,
    });
    const connection = await this.requireConnection();
    const envelope = await this.httpClient.sendRequest(connection, {
      method: 'POST',
      path: 'kunjungan',
      body: payload,
    });
    return {
      bpjsReferenceNo: parseBpjsPcareSubmissionReference(envelope.response),
      submittedKdPoli: kdPoli,
    };
  }

  private async submitObat(sourceData: BpjsSubmissionSourceData): Promise<BpjsSubmissionOutcome> {
    if (sourceData.registration.status === 'CANCELLED') {
      throw new BpjsSubmissionDataError(
        'Registration was cancelled — dispensed medications will not be reported',
      );
    }
    const noKunjungan = this.requireSubmittedKunjunganReference(sourceData);
    const mappedMedications = sourceData.dispensedMedications.filter(
      (medication) => medication.dphoCode !== null,
    );
    const unmappedMedications = sourceData.dispensedMedications.filter(
      (medication) => medication.dphoCode === null,
    );
    if (mappedMedications.length === 0) {
      throw new BpjsSubmissionDataError(
        'None of the dispensed medications have a DPHO code — link them in BPJS mappings and retry',
      );
    }
    if (unmappedMedications.length > 0) {
      this.logger.warn(
        `BPJS medication mapping gap: skipped ${unmappedMedications.length} item(s) without a DPHO code`,
      );
    }
    const connection = await this.requireConnection();
    for (const medication of mappedMedications) {
      const payload = buildBpjsObatPayload({
        noKunjungan,
        kdObat: medication.dphoCode as string,
        quantity: medication.quantity,
        frequency: medication.frequency,
      });
      await this.httpClient.sendRequest(connection, {
        method: 'POST',
        path: 'obat/kunjungan',
        body: payload,
      });
    }
    return { bpjsReferenceNo: noKunjungan, submittedKdPoli: null };
  }

  private requireSubmittedKunjunganReference(sourceData: BpjsSubmissionSourceData): string {
    const kunjungan = sourceData.kunjungan;
    if (kunjungan === null || kunjungan.status === 'PENDING') {
      throw new Error('Waiting for the visit kunjungan to reach PCare first');
    }
    if (kunjungan.status === 'FAILED') {
      throw new BpjsSubmissionDataError(
        'The visit kunjungan failed — fix and retry it before the dispensed medications can be reported',
      );
    }
    if (kunjungan.bpjsReferenceNo === null) {
      throw new BpjsSubmissionDataError(
        'The submitted kunjungan carries no noKunjungan — dispensed medications cannot be attached',
      );
    }
    return kunjungan.bpjsReferenceNo;
  }

  private async submitPendaftaranDelete(
    sourceData: BpjsSubmissionSourceData,
  ): Promise<BpjsSubmissionOutcome> {
    const pendaftaran = sourceData.pendaftaran;
    if (pendaftaran === null || pendaftaran.status !== 'SUBMITTED') {
      throw new BpjsSubmissionDataError(
        'No submitted pendaftaran exists for this registration — nothing to revoke upstream',
      );
    }
    if (pendaftaran.bpjsReferenceNo === null || pendaftaran.submittedKdPoli === null) {
      throw new BpjsSubmissionDataError(
        'The submitted pendaftaran carries no PCare reference number — revoke it manually in PCare',
      );
    }
    const path = buildBpjsPendaftaranDeletePath({
      noKartu: this.requireBpjsNumber(sourceData),
      registrationDate: this.requireRegistrationDate(sourceData),
      noUrut: pendaftaran.bpjsReferenceNo,
      kdPoli: pendaftaran.submittedKdPoli,
    });
    const connection = await this.requireConnection();
    await this.httpClient.sendRequest(connection, { method: 'DELETE', path });
    return { bpjsReferenceNo: pendaftaran.bpjsReferenceNo, submittedKdPoli: null };
  }

  private assertPendaftaranSettled(sourceData: BpjsSubmissionSourceData): void {
    const pendaftaran = sourceData.pendaftaran;
    if (pendaftaran === null || pendaftaran.status === 'SUBMITTED') {
      return;
    }
    if (pendaftaran.status === 'PENDING') {
      throw new Error('Waiting for the visit pendaftaran to reach PCare first');
    }
    throw new BpjsSubmissionDataError(
      'The visit pendaftaran failed — fix and retry it before the kunjungan can be reported',
    );
  }

  private async propagateLateCancellation(registrationId: string): Promise<void> {
    const registrationStatus =
      await this.submissionRepository.findRegistrationStatus(registrationId);
    if (registrationStatus !== 'CANCELLED') {
      return;
    }
    this.logger.warn(
      'BPJS pendaftaran cancelled in flight; enqueueing delete',
    );
    await this.submissionRepository.enqueuePendaftaranDelete(registrationId);
  }

  private requireBpjsNumber(sourceData: BpjsSubmissionSourceData): string {
    if (sourceData.patient.bpjsNumber === null) {
      throw new BpjsSubmissionDataError('Patient has no BPJS number on file');
    }
    return sourceData.patient.bpjsNumber;
  }

  private requirePoliCode(doctor: BpjsSubmissionDoctorData): string {
    if (doctor.bpjsPoliCode === null) {
      throw new BpjsSubmissionDataError(
        `Doctor ${doctor.fullName}'s specialty has no BPJS poli mapping — map the specialty in BPJS mappings first`,
      );
    }
    return doctor.bpjsPoliCode;
  }

  private requireRegistrationDate(sourceData: BpjsSubmissionSourceData): Date {
    const registrationDate =
      sourceData.registration.queueDate ?? sourceData.registration.checkedInAt;
    if (registrationDate === null) {
      throw new BpjsSubmissionDataError('Registration has no check-in date');
    }
    return registrationDate;
  }

  private async requireConfigRecord() {
    const record = await this.configRepository.findConfig();
    if (record === null) {
      throw new BpjsPcareError('BPJS_PCARE_NOT_CONFIGURED', 'BPJS PCare is not configured');
    }
    return record;
  }

  private async requireConnection(): Promise<BpjsPcareConnection> {
    const connection = await this.configRepository.getConnection();
    if (connection === null) {
      throw new BpjsPcareError('BPJS_PCARE_NOT_CONFIGURED', 'BPJS PCare is not configured');
    }
    return connection;
  }

  private async recordFailure(
    submission: BpjsSubmissionRecord,
    attemptNumber: number,
    caughtError: unknown,
  ): Promise<void> {
    const lastError = this.describeError(caughtError);
    const isPermanent =
      caughtError instanceof BpjsSubmissionDataError ||
      (caughtError instanceof BpjsPcareError && PERMANENT_ERROR_CODES.includes(caughtError.code)) ||
      // Antrean failures carry their own error vocabulary, so the two services
      // each classify their own upstream. Everything after that — attempt
      // counting, the backoff curve, the retry endpoint, the monitor — is
      // shared, which is the point of putting both on one outbox (§4.4).
      this.antreanSubmissionService.isPermanentFailure(caughtError);
    if (isPermanent || attemptNumber >= this.adapterConfig.submissionMaxAttempts) {
      await this.submissionRepository.markFailed({
        id: submission.id,
        attempts: attemptNumber,
        lastError,
      });
      this.logger.warn(
        `BPJS ${submission.type} failed permanently after attempt ${attemptNumber}`,
      );
      return;
    }
    const delayMs = this.adapterConfig.submissionRetryBaseDelayMs * 2 ** (attemptNumber - 1);
    await this.submissionRepository.scheduleRetry({
      id: submission.id,
      attempts: attemptNumber,
      nextAttemptAt: new Date(Date.now() + delayMs),
      lastError,
    });
    this.logger.warn(
      `BPJS ${submission.type} attempt ${attemptNumber} failed; retrying in ${delayMs}ms`,
    );
  }

  private isAntreanSubmission(type: BpjsSubmissionRecord['type']): boolean {
    return ANTREAN_SUBMISSION_TYPES.includes(type);
  }

  private describeError(caughtError: unknown): string {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    return message.slice(0, MAX_STORED_ERROR_LENGTH);
  }
}
