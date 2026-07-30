import type { PatientListItem } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, Table, TableBody, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { PatientsTableRow } from './patients-table-row';
import messages from '../../../messages/id/clinical.json';

const PATIENT: PatientListItem = {
  id: 'patient-1',
  mrn: 'MRN-2026-0001',
  fullName: 'Aisha Rahman',
  dateOfBirth: '1990-05-12',
  sex: 'FEMALE',
  status: 'IN_PATIENT',
  phoneNumber: '+628123456789',
  address: 'Jakarta',
  nikMasked: '••••••••0001',
  hasSatusehatPatientId: false,
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  allergyCount: 1,
  doctorCount: 3,
  doctors: [
    { id: 'doctor-1', assignmentId: 'assignment-1', fullName: 'Dr. Budi', specialty: 'Cardiology' },
  ],
};

const FULL_ACCESS_RULES: AppRule[] = [
  { action: 'read', subject: 'Patient' },
  { action: 'update', subject: 'Patient' },
  { action: 'assign', subject: 'DoctorPatient' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'Patient' }];

function renderRow(rules: AppRule[]): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(rules)}>
        <Table>
          <TableBody>
            <PatientsTableRow
              patient={PATIENT}
              onView={vi.fn()}
              onEdit={vi.fn()}
              onAssignDoctor={vi.fn()}
            />
          </TableBody>
        </Table>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('PatientsTableRow', () => {
  it('renders the patient identity, doctor summary, and mapped status badge', () => {
    renderRow(READ_ONLY_RULES);

    expect(screen.getByText('Aisha Rahman')).toBeInTheDocument();
    expect(screen.getByText(/Perempuan, \d+ tahun/)).toBeInTheDocument();
    expect(screen.getByText('MRN-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Dr. Budi')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('Rawat inap')).toBeInTheDocument();
  });

  it('shows edit and assign actions when the ability allows them', async () => {
    const user = userEvent.setup();
    renderRow(FULL_ACCESS_RULES);

    await user.click(screen.getByRole('button', { name: 'Tindakan untuk Aisha Rahman' }));

    expect(await screen.findByText('Lihat')).toBeInTheDocument();
    expect(screen.getByText('Ubah')).toBeInTheDocument();
    expect(screen.getByText('Tetapkan Dokter')).toBeInTheDocument();
  });

  it('hides edit and assign actions for read-only abilities', async () => {
    const user = userEvent.setup();
    renderRow(READ_ONLY_RULES);

    await user.click(screen.getByRole('button', { name: 'Tindakan untuk Aisha Rahman' }));

    expect(await screen.findByText('Lihat')).toBeInTheDocument();
    expect(screen.queryByText('Ubah')).not.toBeInTheDocument();
    expect(screen.queryByText('Tetapkan Dokter')).not.toBeInTheDocument();
  });
});
