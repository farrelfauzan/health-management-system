import {
  ClinicalDocumentSignerRecord,
  ClinicalRequestRenderContext,
  ClinicLetterhead,
  getCalendarDateInTimeZone,
  PrescriptionDetailRecord,
} from '@hms/shared-types';

import { buildClinicLetterheadValues } from '../../clinical-request-document/service/build-clinic-letterhead-values';
import { buildSignerValues } from '../../clinical-request-document/service/build-signer-values';
import { formatIndonesianDateTime } from '../../clinical-request-document/service/format-indonesian-date-time';

const SEX_LABELS: Readonly<Record<string, string>> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
};

type BuildPrescriptionContextParams = {
  prescription: PrescriptionDetailRecord;
  patientDateOfBirth: Date | null;
  patientSex: 'MALE' | 'FEMALE' | null;
  letterhead: ClinicLetterhead;
  /** The prescribing clinician, with the licences the signature reads. */
  signer: ClinicalDocumentSignerRecord | null;
  /** The clinic's zone: a resep written at 00:30 WIB is dated that day. */
  timeZone: string;
};

/**
 * Gathers everything the resep prints (`P18-T12`).
 *
 * The pharmacy module's counterpart to the laboratory's letter context, and
 * separate from it for the same reason: what a prescription line means — a
 * catalog product, or a racikan named by its compound — is this module's
 * knowledge, and the renderer must not acquire an opinion about it.
 *
 * A compound line prints under its compound name rather than its ingredients:
 * the apotek dispenses the puyer, and listing six substances where the doctor
 * wrote one preparation invites somebody to hand over six.
 */
export function buildPrescriptionContext(
  params: BuildPrescriptionContextParams,
): ClinicalRequestRenderContext {
  const { prescription, patientDateOfBirth, patientSex, letterhead, timeZone } = params;
  const issuedAt = prescription.issuedAt ?? new Date();
  const issuedOn = formatIndonesianDateTime({ value: issuedAt, timeZone, withTime: false });

  return {
    kind: 'PRESCRIPTION',
    subjectId: prescription.id,
    patientId: prescription.patientId,
    encounterId: prescription.encounterId,
    title: `Resep ${prescription.patient.mrn} — ${issuedOn}`,
    values: {
      ...buildClinicLetterheadValues(letterhead),
      'patient.fullName': prescription.patient.fullName,
      'patient.mrn': prescription.patient.mrn,
      'patient.dateOfBirth': patientDateOfBirth
        ? formatIndonesianDateTime({ value: patientDateOfBirth, timeZone: 'UTC', withTime: false })
        : '-',
      'patient.sex': patientSex ? (SEX_LABELS[patientSex] ?? '-') : '-',
      'patient.age': patientDateOfBirth ? `${toAgeYears(patientDateOfBirth, issuedAt)} tahun` : '-',
      ...buildSignerValues({
        signer: params.signer,
        asOfDate: getCalendarDateInTimeZone(issuedAt, timeZone),
      }),
      'request.issuedAt': issuedOn,
      'prescription.notes': prescription.notes ?? '-',
      // The same one-line difference the lab letter carries (P18-T11): a resep
      // the patient fills outside names the apotek they were sent to.
      'prescription.destination':
        prescription.fulfilmentSite === 'EXTERNAL'
          ? (prescription.externalFacilityName ?? 'Apotek rujukan')
          : `Apotek ${letterhead.name}`,
    },
    lines: prescription.items.map((item, index) => ({
      'medication.no': String(index + 1),
      'medication.name': item.isCompound
        ? (item.compoundName ?? 'Racikan')
        : (item.medication?.name ?? '-'),
      'medication.dosage': item.dosage,
      'medication.frequency': item.frequency,
      'medication.quantity': String(item.quantity),
      'medication.instructions': item.instructions ?? '-',
    })),
  };
}

const MONTHS_PER_YEAR = 12;

function toAgeYears(dateOfBirth: Date, asOf: Date): number {
  const months =
    (asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear()) * MONTHS_PER_YEAR +
    (asOf.getUTCMonth() - dateOfBirth.getUTCMonth());
  const hasHadBirthdayThisMonth = asOf.getUTCDate() >= dateOfBirth.getUTCDate();

  return Math.max(0, Math.floor((months - (hasHadBirthdayThisMonth ? 0 : 1)) / MONTHS_PER_YEAR));
}
