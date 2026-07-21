import type { PatientStatusValue } from '@hms/shared-types';

const STATUS_LABELS: Record<PatientStatusValue, string> = {
  IN_PATIENT: 'IN-PATIENT',
  OUT_PATIENT: 'OUT-PATIENT',
  DISCHARGED: 'DISCHARGED',
};

export function formatPatientStatusLabel(status: string): string {
  return STATUS_LABELS[status as PatientStatusValue] ?? status.trim().toUpperCase();
}
