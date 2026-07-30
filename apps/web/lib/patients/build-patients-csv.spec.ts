import type { PatientListItem } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { buildPatientsCsv } from './build-patients-csv';

function buildPatient(overrides: Partial<PatientListItem> = {}): PatientListItem {
  return {
    id: 'patient-1',
    mrn: 'MRN-2026-0001',
    fullName: 'Aisha Rahman',
    dateOfBirth: '1990-05-12',
    sex: 'FEMALE',
    status: 'OUT_PATIENT',
    phoneNumber: '+628123456789',
    address: 'Jakarta',
    hasSatusehatPatientId: false,
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
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
      'ID Pasien',
      'Nama Lengkap',
      'Jenis Kelamin',
      'Tanggal Lahir',
      'Status',
      'Nomor Telepon',
      'Alamat',
      'Dokter yang Ditetapkan',
      'Terdaftar Pada',
    ],
    sex: () => 'Perempuan',
    status: () => 'Rawat jalan',
    date: () => '12 Mei 1990',
    dateTime: () => '1 Jul 2026, 07.00',
  };

  it('builds a header row and one row per patient', () => {
    const csv = buildPatientsCsv([buildPatient()], messages);
    const [header, row] = csv.split('\n');

    expect(header).toBe(
      'ID Pasien,Nama Lengkap,Jenis Kelamin,Tanggal Lahir,Status,Nomor Telepon,Alamat,Dokter yang Ditetapkan,Terdaftar Pada',
    );
    expect(row).toBe(
      'MRN-2026-0001,Aisha Rahman,Perempuan,12 Mei 1990,Rawat jalan,+628123456789,Jakarta,Dr. Budi,"1 Jul 2026, 07.00"',
    );
  });

  it('escapes values containing commas and quotes', () => {
    const csv = buildPatientsCsv(
      [buildPatient({ address: 'Jl. Melati, Blok "A"', doctors: [], doctorCount: 0 })],
      messages,
    );

    expect(csv.split('\n')[1]).toContain('"Jl. Melati, Blok ""A"""');
  });
});
