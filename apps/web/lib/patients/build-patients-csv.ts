import type { PatientListItem } from '@hms/shared-types';

type PatientsCsvMessages = {
  headers: readonly string[];
  sex: (value: PatientListItem['sex']) => string;
  status: (value: PatientListItem['status']) => string;
  date: (value: string) => string;
  dateTime: (value: string) => string;
};

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildPatientsCsv(
  patients: PatientListItem[],
  messages: PatientsCsvMessages,
): string {
  const rows = patients.map((patient) => [
    patient.mrn,
    patient.fullName,
    messages.sex(patient.sex),
    messages.date(patient.dateOfBirth),
    messages.status(patient.status),
    patient.phoneNumber,
    patient.address,
    patient.doctors.map((doctor) => doctor.fullName).join('; '),
    messages.dateTime(patient.createdAt),
  ]);

  return [messages.headers.map(escapeCsvValue), ...rows.map((row) => row.map(escapeCsvValue))]
    .map((row) => row.join(','))
    .join('\n');
}
