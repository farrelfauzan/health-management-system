import type { PatientListItem } from '@hms/shared-types';

import { formatPatientSexLabel } from '#lib/patients/patient-sex-label';
import { formatPatientStatusLabel } from '#lib/patients/patient-status-label';

const CSV_HEADERS = [
  'Patient ID',
  'Full Name',
  'Sex',
  'Date of Birth',
  'Status',
  'Phone Number',
  'Address',
  'Assigned Doctors',
  'Registered At',
] as const;

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildPatientsCsv(patients: PatientListItem[]): string {
  const rows = patients.map((patient) => [
    patient.mrn,
    patient.fullName,
    formatPatientSexLabel(patient.sex),
    patient.dateOfBirth,
    formatPatientStatusLabel(patient.status),
    patient.phoneNumber,
    patient.address,
    patient.doctors.map((doctor) => doctor.fullName).join('; '),
    patient.createdAt,
  ]);

  return [CSV_HEADERS.map(escapeCsvValue), ...rows.map((row) => row.map(escapeCsvValue))]
    .map((row) => row.join(','))
    .join('\n');
}
