import type { PatientListItem } from '@hms/shared-types';

type PatientsCsvMessages = {
  headers: readonly string[];
  status: (value: PatientListItem['status']) => string;
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
    patient.fullName,
    messages.status(patient.status),
    patient.doctors.map((doctor) => doctor.fullName).join('; '),
  ]);

  return [messages.headers.map(escapeCsvValue), ...rows.map((row) => row.map(escapeCsvValue))]
    .map((row) => row.join(','))
    .join('\n');
}
