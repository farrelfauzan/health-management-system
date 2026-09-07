import {
  ClinicalRequestRenderContext,
  ClinicProfileView,
  PrescriptionDetailRecord,
} from '@hms/shared-types';

const SEX_LABELS: Readonly<Record<string, string>> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
};

type BuildPrescriptionContextParams = {
  prescription: PrescriptionDetailRecord;
  patientDateOfBirth: Date | null;
  patientSex: 'MALE' | 'FEMALE' | null;
  clinic: ClinicProfileView | null;
  clinicLogoDataUri: string | null;
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
  const { prescription, patientDateOfBirth, patientSex, clinic, clinicLogoDataUri } = params;
  const issuedAt = prescription.issuedAt ?? new Date();

  return {
    kind: 'PRESCRIPTION',
    subjectId: prescription.id,
    patientId: prescription.patientId,
    encounterId: prescription.encounterId,
    title: `Resep ${prescription.patient.mrn} — ${formatIndonesianDate(issuedAt)}`,
    values: {
      'clinic.name': clinic?.name ?? '',
      'clinic.legalName': clinic?.legalName ?? '',
      'clinic.address': clinic?.address ?? '',
      'clinic.phone': clinic?.phoneNumber ?? '',
      'clinic.email': clinic?.email ?? '',
      'clinic.licenseNumber': clinic?.licenseNumber ?? '',
      'clinic.taxId': clinic?.taxId ?? '',
      'clinic.logo': clinicLogoDataUri ?? '',
      'patient.fullName': prescription.patient.fullName,
      'patient.mrn': prescription.patient.mrn,
      'patient.dateOfBirth': patientDateOfBirth ? formatIndonesianDate(patientDateOfBirth) : '-',
      'patient.sex': patientSex ? (SEX_LABELS[patientSex] ?? '') : '',
      'patient.age': patientDateOfBirth ? `${toAgeYears(patientDateOfBirth, issuedAt)} tahun` : '-',
      'doctor.fullName': prescription.doctor.fullName,
      'doctor.licenseNumber': prescription.doctor.licenseNumber,
      'request.issuedAt': formatIndonesianDate(issuedAt),
      'prescription.notes': prescription.notes ?? '-',
      // The same one-line difference the lab letter carries (P18-T11): a resep
      // the patient fills outside names the apotek they were sent to.
      'prescription.destination':
        prescription.fulfilmentSite === 'EXTERNAL'
          ? (prescription.externalFacilityName ?? 'Apotek rujukan')
          : `Apotek ${clinic?.name ?? 'klinik'}`,
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

const MONTHS_PER_YEAR = 12;

function toAgeYears(dateOfBirth: Date, asOf: Date): number {
  const months =
    (asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear()) * MONTHS_PER_YEAR +
    (asOf.getUTCMonth() - dateOfBirth.getUTCMonth());
  const hasHadBirthdayThisMonth = asOf.getUTCDate() >= dateOfBirth.getUTCDate();

  return Math.max(0, Math.floor((months - (hasHadBirthdayThisMonth ? 0 : 1)) / MONTHS_PER_YEAR));
}
