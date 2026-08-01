import { BpjsAntreanAddPayload } from './bpjs-antrean-submission.types';
import { formatBpjsAntreanDate } from './format-bpjs-antrean-date';

const JKN_PATIENT_TYPE = 'JKN';
const DEFAULT_NOTE = 'Peserta mendaftar langsung di fasilitas kesehatan';

type BuildBpjsAntreanAddPayloadOptions = {
  readonly bookingCode: string;
  readonly cardNumber: string;
  readonly nationalIdentityNumber: string;
  readonly phoneNumber: string;
  readonly poliCode: string;
  readonly poliName: string;
  readonly medicalRecordNumber: string;
  readonly examinationDate: Date;
  readonly doctorCode: string;
  readonly doctorName: string;
  readonly practiceWindow: string;
  readonly queueNumber: number;
  readonly estimatedServiceTime: number;
};

/**
 * Builds the `antrean/add` body that publishes a walk-in's queue entry to
 * BPJS (P14-T05).
 *
 * `jenispasien` is pinned to `JKN`: this payload is only ever built for a
 * patient who has a BPJS card number on file, which the enqueue hook checks
 * before creating the outbox row. A non-JKN walk-in has no queue entry to
 * publish, so there is no branch here to get wrong.
 *
 * `nomorantrean` is the display form BPJS shows the member and `angkaantrean`
 * is the same number bare. HMS runs no letter series per poli, so the poli
 * code stands in for the prefix rather than inventing an `A-` the clinic's own
 * displays never show.
 */
export function buildBpjsAntreanAddPayload(
  options: BuildBpjsAntreanAddPayloadOptions,
): BpjsAntreanAddPayload {
  return {
    kodebooking: options.bookingCode,
    jenispasien: JKN_PATIENT_TYPE,
    nomorkartu: options.cardNumber,
    nik: options.nationalIdentityNumber,
    nohp: options.phoneNumber,
    kodepoli: options.poliCode,
    namapoli: options.poliName,
    norm: options.medicalRecordNumber,
    tanggalperiksa: formatBpjsAntreanDate(options.examinationDate),
    kodedokter: options.doctorCode,
    namadokter: options.doctorName,
    jampraktek: options.practiceWindow,
    nomorantrean: `${options.poliCode}-${options.queueNumber}`,
    angkaantrean: options.queueNumber,
    estimasidilayani: options.estimatedServiceTime,
    keterangan: DEFAULT_NOTE,
  };
}
