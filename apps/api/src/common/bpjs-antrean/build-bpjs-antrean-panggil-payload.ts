import { BpjsAntreanPanggilPayload } from './bpjs-antrean-submission.types';
import { formatBpjsAntreanDate } from './format-bpjs-antrean-date';

/**
 * The service-progress status HMS is able to report. `3` is "sedang dilayani"
 * in the FKTP status vocabulary — the point at which the doctor opens the
 * encounter.
 *
 * HMS cannot report the earlier steps honestly: `RegistrationStatus` goes
 * `PENDING → CHECKED_IN → COMPLETED` and there is **no "patient called"
 * event** anywhere in the system (evaluation §3.5). So rather than emit a
 * "called" time that is really a "served" time, this publishes one status at
 * the one moment HMS actually observes. Whether that is enough for BPJS's
 * dashboard is spike question Q1; if the FKTP flavour turns out to want the
 * full FKRTL task-ID set, the answer is to add the missing event to the
 * registration lifecycle as its own task, not to fabricate timestamps here.
 */
const SERVING_STATUS = 3;

type BuildBpjsAntreanPanggilPayloadOptions = {
  readonly examinationDate: Date;
  readonly poliCode: string;
  readonly cardNumber: string;
  readonly occurredAt: Date;
};

/**
 * Builds the `antrean/panggil` body reporting that the member is now being
 * served. `waktu` is epoch milliseconds, matching `estimasidilayani`.
 */
export function buildBpjsAntreanPanggilPayload(
  options: BuildBpjsAntreanPanggilPayloadOptions,
): BpjsAntreanPanggilPayload {
  return {
    tanggalperiksa: formatBpjsAntreanDate(options.examinationDate),
    kodepoli: options.poliCode,
    nomorkartu: options.cardNumber,
    status: SERVING_STATUS,
    waktu: options.occurredAt.getTime(),
  };
}
