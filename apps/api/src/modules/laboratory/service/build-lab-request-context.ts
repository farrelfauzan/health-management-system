import {
  ClinicalRequestRenderContext,
  ClinicProfileView,
  LabOrderRecord,
  LabWorklistPatientRecord,
} from '@hms/shared-types';

import { encodeCode128Svg } from '../../clinical-request-document/service/encode-code128-svg';
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
  doctorName: string;
  doctorLicenseNumber: string | null;
  clinic: ClinicProfileView | null;
  /**
   * The letterhead prints the clinic's name, address, telephone and izin — what
   * a surat pengantar is legally expected to carry. The logo is cosmetic and
   * arrives with the caller that can read its bytes; null prints a text-only
   * letterhead, which is a complete letter.
   */
  clinicLogoDataUri: string | null;
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
  const { order, patient, doctorName, doctorLicenseNumber, clinic, clinicLogoDataUri } = params;
  const issuedAt = new Date();

  return {
    kind: 'LAB_REQUEST',
    subjectId: order.id,
    patientId: order.patientId,
    encounterId: order.encounterId,
    title: `Surat pengantar laboratorium ${order.orderNumber}`,
    values: {
      'clinic.name': clinic?.name ?? '',
      'clinic.legalName': clinic?.legalName ?? '',
      'clinic.address': clinic?.address ?? '',
      'clinic.phone': clinic?.phoneNumber ?? '',
      'clinic.email': clinic?.email ?? '',
      'clinic.licenseNumber': clinic?.licenseNumber ?? '',
      'clinic.taxId': clinic?.taxId ?? '',
      'clinic.logo': clinicLogoDataUri ?? '',
      'patient.fullName': patient.fullName,
      'patient.mrn': patient.mrn,
      'patient.dateOfBirth': formatIndonesianDate(patient.dateOfBirth),
      'patient.sex': SEX_LABELS[patient.sex] ?? '',
      'patient.age': `${toPatientAgeYears(patient.dateOfBirth, issuedAt)} tahun`,
      'doctor.fullName': doctorName,
      'doctor.licenseNumber': doctorLicenseNumber ?? '',
      'request.issuedAt': formatIndonesianDate(issuedAt),
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
          : `Laboratorium ${clinic?.name ?? 'klinik'}`,
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

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatIndonesianDate(value: Date): string {
  return `${value.getUTCDate()} ${INDONESIAN_MONTHS[value.getUTCMonth()] ?? ''} ${value.getUTCFullYear()}`;
}
