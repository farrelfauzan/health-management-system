import {
  ClinicalDocumentSignerRecord,
  ClinicalRequestRenderContext,
  ClinicLetterhead,
  getCalendarDateInTimeZone,
  LabOrderRecord,
  LabWorklistPatientRecord,
} from '@hms/shared-types';

import { buildClinicLetterheadValues } from '../../clinical-request-document/service/build-clinic-letterhead-values';
import { buildSignerValues } from '../../clinical-request-document/service/build-signer-values';
import { encodeCode128Svg } from '../../clinical-request-document/service/encode-code128-svg';
import { formatIndonesianDateTime } from '../../clinical-request-document/service/format-indonesian-date-time';
import { toPatientAgeYears } from './to-patient-age-years';

const SPECIMEN_LABELS: Readonly<Record<string, string>> = {
  WHOLE_BLOOD: 'Darah lengkap',
  SERUM: 'Serum',
  PLASMA: 'Plasma',
  URINE: 'Urin',
  STOOL: 'Feses',
  SPUTUM: 'Dahak',
  SWAB: 'Swab',
  OTHER: 'Lainnya',
};

const PRIORITY_LABELS: Readonly<Record<string, string>> = {
  ROUTINE: 'Rutin',
  URGENT: 'Cito',
};

const SEX_LABELS: Readonly<Record<string, string>> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
};

type BuildLabRequestContextParams = {
  order: LabOrderRecord;
  patient: LabWorklistPatientRecord;
  /** The requester line: our clinician, or the outside doctor who sent the patient. */
  doctorName: string;
  /**
   * The ordering clinician with the licences the signature reads (D-032), or
   * null for an order an outside doctor sent in — nobody here signs it.
   */
  signer: ClinicalDocumentSignerRecord | null;
  /**
   * The letterhead prints the clinic's name, address, telephone and izin — what
   * a surat pengantar is legally expected to carry — with the logo inlined.
   */
  letterhead: ClinicLetterhead;
  /** The clinic's zone: a letter printed at 00:30 WIB is dated that day. */
  timeZone: string;
  /** When the letter is printed; the clock in production. */
  issuedAt?: Date;
};

/**
 * Gathers everything the surat pengantar prints (`P18-T12`).
 *
 * It lives in the laboratory module, not the renderer: what a lab order means —
 * which tests, grouped under which panel, sent where — is this module's
 * knowledge, and a renderer that worked it out itself would be a second opinion
 * about what was ordered.
 *
 * Every value is formatted here, in Indonesian, because the letter is a
 * clinical document handed to a patient in Indonesia. The renderer places
 * strings and formats nothing.
 */
export function buildLabRequestContext(
  params: BuildLabRequestContextParams,
): ClinicalRequestRenderContext {
  const { order, patient, letterhead, timeZone, issuedAt = new Date() } = params;

  return {
    kind: 'LAB_REQUEST',
    subjectId: order.id,
    patientId: order.patientId,
    encounterId: order.encounterId,
    title: `Surat pengantar laboratorium ${order.orderNumber}`,
    values: {
      ...buildClinicLetterheadValues(letterhead),
      'patient.fullName': patient.fullName,
      'patient.mrn': patient.mrn,
      'patient.dateOfBirth': formatIndonesianDateTime({
        value: patient.dateOfBirth,
        timeZone: 'UTC',
        withTime: false,
      }),
      'patient.sex': SEX_LABELS[patient.sex] ?? '-',
      'patient.age': `${toPatientAgeYears(patient.dateOfBirth, issuedAt)} tahun`,
      ...buildSignerValues({
        signer: params.signer,
        asOfDate: getCalendarDateInTimeZone(issuedAt, timeZone),
      }),
      // After the signer: an outside requester is named on the letter even
      // though nobody here signs it.
      'doctor.fullName': params.doctorName,
      'request.issuedAt': formatIndonesianDateTime({ value: issuedAt, timeZone, withTime: false }),
      'order.number': order.orderNumber,
      // Null when the number carries a character Code set B cannot express,
      // which is never for `LAB/YYYYMMDD/####` — but the letter still prints
      // the number as text, so a missing barcode costs legibility, not use.
      'order.barcode': encodeCode128Svg(order.orderNumber) ?? '',
      'order.priority': PRIORITY_LABELS[order.priority] ?? '',
      'order.isFasting': order.isFasting ? 'Ya — pasien harus berpuasa' : 'Tidak',
      'order.clinicalNotes': order.clinicalNotes ?? '-',
      // One template serves both destinations (P18-T11): the line that differs
      // between a letter kept in-house and a referral out is this one.
      'order.destination':
        order.fulfilmentSite === 'EXTERNAL'
          ? (order.externalFacilityName ?? 'Laboratorium rujukan')
          : `Laboratorium ${letterhead.name}`,
    },
    lines: order.items.map((item, index) => ({
      'test.no': String(index + 1),
      'test.code': item.code,
      'test.name': item.name,
      'test.panel': item.panelName ?? '-',
      'test.specimen': SPECIMEN_LABELS[item.specimenType] ?? item.specimenType,
    })),
  };
}
