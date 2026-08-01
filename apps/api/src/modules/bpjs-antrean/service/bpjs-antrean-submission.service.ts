import { Injectable } from '@nestjs/common';

import {
  BpjsAntreanSubmissionSourceData,
  BpjsSubmissionSourceData,
  BpjsSubmissionTypeValue,
} from '@hms/shared-types';

import { BpjsAntreanHttpClient } from '../../../common/bpjs-antrean/bpjs-antrean-http.client';
import { BpjsAntreanError } from '../../../common/bpjs-antrean/bpjs-antrean.error';
import { BpjsAntreanErrorCode } from '../../../common/bpjs-antrean/bpjs-antrean.types';
import { buildAntreanBookingCode } from '../../../common/bpjs-antrean/build-antrean-booking-code';
import { buildBpjsAntreanAddPayload } from '../../../common/bpjs-antrean/build-bpjs-antrean-add-payload';
import { buildBpjsAntreanBatalPayload } from '../../../common/bpjs-antrean/build-bpjs-antrean-batal-payload';
import { buildBpjsAntreanPanggilPayload } from '../../../common/bpjs-antrean/build-bpjs-antrean-panggil-payload';
import { BpjsSubmissionDataError } from '../../bpjs-pcare/service/bpjs-submission-data.error';
import { BpjsAntreanConfigRepository } from '../repository/bpjs-antrean-config.repository';

const ADD_PATH = 'antrean/add';
const PANGGIL_PATH = 'antrean/panggil';
const BATAL_PATH = 'antrean/batal';
const MILLISECONDS_PER_MINUTE = 60_000;
const DEFAULT_AVERAGE_SERVICE_MINUTES = 15;

/**
 * Permanent Antrean failures — the ones a retry cannot fix. Mirrors the PCare
 * list deliberately: an unconfigured facility, a rejected signature, and a
 * request BPJS refused on its merits are all states where the retry budget is
 * spent on nothing. Timeouts, upstream outages and an open circuit are absent
 * on purpose; those are exactly what backoff exists for.
 */
const PERMANENT_ERROR_CODES: readonly BpjsAntreanErrorCode[] = [
  'BPJS_ANTREAN_NOT_CONFIGURED',
  'BPJS_ANTREAN_UNAUTHORIZED',
  'BPJS_ANTREAN_REQUEST_REJECTED',
];

export type BpjsAntreanSubmissionOutcome = {
  bpjsReferenceNo: string | null;
  submittedKdPoli: string | null;
};

/**
 * Publishes the clinic's own queue activity to BPJS (P14-T05): `antrean/add`
 * for walk-ins, `antrean/panggil` when the doctor starts seeing the patient,
 * and `antrean/batal` when a published entry is withdrawn.
 *
 * This is the mirror image of P14-T04 — there BPJS calls HMS, here HMS calls
 * BPJS — and the two halves share only the credential row and the codec. In
 * particular this service does **no** queue arithmetic of its own: the numbers
 * it publishes were allocated by the registration transaction (P14-T01), and
 * re-deriving them here could publish a number the clinic's own display never
 * shows.
 *
 * It settles nothing about the outbox row. Attempt counting, backoff and the
 * permanent-versus-transient decision stay in `BpjsSubmissionService`, which
 * owns them for both integrations — one policy, one worker, one monitor
 * (evaluation §4.4).
 */
@Injectable()
export class BpjsAntreanSubmissionService {
  constructor(
    private readonly httpClient: BpjsAntreanHttpClient,
    private readonly configRepository: BpjsAntreanConfigRepository,
  ) {}

  /** Whether this failure should fail the row rather than schedule a retry. */
  isPermanentFailure(caughtError: unknown): boolean {
    return (
      caughtError instanceof BpjsAntreanError && PERMANENT_ERROR_CODES.includes(caughtError.code)
    );
  }

  async submit(
    type: BpjsSubmissionTypeValue,
    sourceData: BpjsSubmissionSourceData,
  ): Promise<BpjsAntreanSubmissionOutcome> {
    if (type === 'ANTREAN_ADD') {
      return this.submitAdd(sourceData);
    }
    if (type === 'ANTREAN_PANGGIL') {
      return this.submitPanggil(sourceData);
    }
    return this.submitBatal(sourceData);
  }

  private async submitAdd(
    sourceData: BpjsSubmissionSourceData,
  ): Promise<BpjsAntreanSubmissionOutcome> {
    if (sourceData.registration.status === 'CANCELLED') {
      throw new BpjsSubmissionDataError(
        'Registration was cancelled before the queue entry was published — nothing to publish',
      );
    }
    // Belt and braces with the enqueue hook. The hook is what normally stops
    // a Mobile JKN booking being re-published, but this row could have been
    // created before the booking was linked, or requeued by hand from the
    // monitor — and a duplicate queue entry reaches the member's phone.
    if (sourceData.antrean.bpjsBookingCode !== null) {
      throw new BpjsSubmissionDataError(
        'This booking originated in Mobile JKN and is already BPJS’s own queue entry — it is never republished',
      );
    }
    const antrean = sourceData.antrean;
    const examinationDate = this.requireExaminationDate(sourceData);
    const queueNumber = this.requireQueueNumber(antrean);
    const payload = buildBpjsAntreanAddPayload({
      bookingCode: buildAntreanBookingCode({
        poliCode: this.requirePoliCode(antrean),
        examinationDate: this.toCalendarDate(examinationDate),
      }),
      cardNumber: this.requireCardNumber(sourceData),
      nationalIdentityNumber: this.requireNationalIdentityNumber(antrean),
      phoneNumber: antrean.phoneNumber,
      poliCode: this.requirePoliCode(antrean),
      poliName: antrean.poliName ?? this.requirePoliCode(antrean),
      medicalRecordNumber: antrean.medicalRecordNumber,
      examinationDate,
      doctorCode: this.requireDoctorCode(antrean),
      doctorName: antrean.doctorName ?? '',
      practiceWindow: this.requirePracticeWindow(antrean),
      queueNumber,
      estimatedServiceTime: this.estimateServiceTime(antrean, examinationDate, queueNumber),
    });
    await this.sendRequest(ADD_PATH, payload);
    return { bpjsReferenceNo: payload.kodebooking, submittedKdPoli: payload.kodepoli };
  }

  private async submitPanggil(
    sourceData: BpjsSubmissionSourceData,
  ): Promise<BpjsAntreanSubmissionOutcome> {
    // The encounter's start is the moment HMS actually observed, so it is
    // what gets published — not the time this row happened to drain. A row
    // that waited out a BPJS outage must still report when the patient was
    // seen, or the clinic's dashboard reads as though every visit began the
    // moment the network came back.
    const encounter = sourceData.encounter;
    if (encounter === null) {
      throw new BpjsSubmissionDataError(
        'The visit has no encounter — there is no service-start time to report',
      );
    }
    this.assertAntreanAddSettled(sourceData);
    const payload = buildBpjsAntreanPanggilPayload({
      examinationDate: this.requireExaminationDate(sourceData),
      poliCode: this.requirePublishedPoliCode(sourceData),
      cardNumber: this.requireCardNumber(sourceData),
      occurredAt: encounter.startedAt,
    });
    await this.sendRequest(PANGGIL_PATH, payload);
    return { bpjsReferenceNo: null, submittedKdPoli: payload.kodepoli };
  }

  private async submitBatal(
    sourceData: BpjsSubmissionSourceData,
  ): Promise<BpjsAntreanSubmissionOutcome> {
    const payload = buildBpjsAntreanBatalPayload({
      examinationDate: this.requireExaminationDate(sourceData),
      poliCode: this.requirePublishedPoliCode(sourceData),
      cardNumber: this.requireCardNumber(sourceData),
      reason: null,
    });
    await this.sendRequest(BATAL_PATH, payload);
    return { bpjsReferenceNo: null, submittedKdPoli: payload.kodepoli };
  }

  /**
   * Holds a follow-up back until the queue entry exists upstream. Mirrors the
   * PCare `pendaftaran` → `kunjungan` ordering: a *pending* add is a transient
   * error so the retry budget waits for the worker, while a *failed* one is
   * permanent — reporting progress on a queue entry BPJS never accepted would
   * be rejected on every attempt.
   */
  private assertAntreanAddSettled(sourceData: BpjsSubmissionSourceData): void {
    const antreanAdd = sourceData.antreanAdd;
    if (antreanAdd === null || antreanAdd.status === 'SUBMITTED') {
      return;
    }
    if (antreanAdd.status === 'PENDING') {
      throw new Error('Waiting for the queue entry to reach BPJS Antrean first');
    }
    throw new BpjsSubmissionDataError(
      'The queue entry failed to publish — fix and retry it before reporting service progress',
    );
  }

  private async sendRequest(path: string, body: unknown): Promise<void> {
    const connection = await this.configRepository.getConnection();
    if (connection === null) {
      throw new BpjsAntreanError(
        'BPJS_ANTREAN_NOT_CONFIGURED',
        'BPJS Antrean is not configured',
      );
    }
    await this.httpClient.sendRequest(connection, { method: 'POST', path, body });
  }

  /**
   * The poli the queue entry was actually published under, not the one the
   * registration carries now. A poli reassignment after `antrean/add` would
   * otherwise address the follow-up at a queue BPJS never heard of.
   */
  private requirePublishedPoliCode(sourceData: BpjsSubmissionSourceData): string {
    const publishedPoliCode = sourceData.antreanAdd?.submittedKdPoli ?? null;
    if (publishedPoliCode !== null) {
      return publishedPoliCode;
    }
    return this.requirePoliCode(sourceData.antrean);
  }

  private estimateServiceTime(
    antrean: BpjsAntreanSubmissionSourceData,
    examinationDate: Date,
    queueNumber: number,
  ): number {
    const sessionStart = antrean.sessionStart ?? examinationDate;
    return (
      sessionStart.getTime() +
      Math.max(0, queueNumber - 1) * DEFAULT_AVERAGE_SERVICE_MINUTES * MILLISECONDS_PER_MINUTE
    );
  }

  private toCalendarDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private requireExaminationDate(sourceData: BpjsSubmissionSourceData): Date {
    const examinationDate =
      sourceData.registration.queueDate ?? sourceData.registration.checkedInAt;
    if (examinationDate === null) {
      throw new BpjsSubmissionDataError('Registration has no check-in date');
    }
    return examinationDate;
  }

  private requireCardNumber(sourceData: BpjsSubmissionSourceData): string {
    if (sourceData.patient.bpjsNumber === null) {
      throw new BpjsSubmissionDataError('Patient has no BPJS number on file');
    }
    return sourceData.patient.bpjsNumber;
  }

  private requireNationalIdentityNumber(antrean: BpjsAntreanSubmissionSourceData): string {
    if (antrean.nationalIdentityNumber === null) {
      throw new BpjsSubmissionDataError(
        'Patient has no NIK on file — Antrean Online requires one alongside the card number',
      );
    }
    return antrean.nationalIdentityNumber;
  }

  private requirePoliCode(antrean: BpjsAntreanSubmissionSourceData): string {
    if (antrean.poliCode === null) {
      throw new BpjsSubmissionDataError(
        'The visit’s poli has no BPJS code — map the specialty in BPJS mappings first',
      );
    }
    return antrean.poliCode;
  }

  private requireDoctorCode(antrean: BpjsAntreanSubmissionSourceData): string {
    if (antrean.doctorCode === null) {
      throw new BpjsSubmissionDataError(
        'The attending doctor has no BPJS kdDokter mapping — map the doctor in BPJS mappings first',
      );
    }
    return antrean.doctorCode;
  }

  private requirePracticeWindow(antrean: BpjsAntreanSubmissionSourceData): string {
    if (antrean.practiceWindow === null) {
      throw new BpjsSubmissionDataError(
        'The visit has no practice session — Antrean Online publishes against a doctor’s shift',
      );
    }
    return antrean.practiceWindow;
  }

  private requireQueueNumber(antrean: BpjsAntreanSubmissionSourceData): number {
    if (antrean.poliQueueNumber === null) {
      throw new BpjsSubmissionDataError(
        'The visit has no per-poli antrian number — nothing to publish as angkaantrean',
      );
    }
    return antrean.poliQueueNumber;
  }
}
