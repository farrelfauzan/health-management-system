import type { PatientListItem } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { buildPatientsCsv } from './build-patients-csv';

function buildPatient(overrides: Partial<PatientListItem> = {}): PatientListItem {
  return {
    id: 'patient-1',
    fullName: 'Aisha Rahman',
    status: 'OUT_PATIENT',
    isActive: true,
    allergyCount: 0,
    doctorCount: 1,
    doctors: [
      {
        id: 'doctor-1',
        assignmentId: 'assignment-1',
        fullName: 'Dr. Budi',
        specialty: 'Cardiology',
      },
    ],
    ...overrides,
  };
}

describe('buildPatientsCsv', () => {
  const messages = {
    headers: [
      'Nama Lengkap',
      'Status',
      'Dokter yang Ditetapkan',
    ],
    status: () => 'Rawat jalan',
  };

  it('builds a header row and one row per patient', () => {
    const csv = buildPatientsCsv([buildPatient()], messages);
    const [header, row] = csv.split('\n');

    expect(header).toBe('Nama Lengkap,Status,Dokter yang Ditetapkan');
    expect(row).toBe('Aisha Rahman,Rawat jalan,Dr. Budi');
  });

  it('escapes values containing commas and quotes', () => {
    const csv = buildPatientsCsv(
      [buildPatient({ fullName: 'Aisha, "Rahman"', doctors: [], doctorCount: 0 })],
      messages,
    );

    expect(csv.split('\n')[1]).toContain('"Aisha, ""Rahman"""');
  });
});
