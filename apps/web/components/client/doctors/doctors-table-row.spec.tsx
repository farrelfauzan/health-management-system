import type { DoctorListItem } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, Table, TableBody, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { DoctorsTableRow } from './doctors-table-row';
import clinicalMessages from '../../../messages/id/clinical.json';
import sharedMessages from '../../../messages/id/shared.json';

const messages = { ...clinicalMessages, ...sharedMessages };

const DOCTOR: DoctorListItem = {
  id: 'doctor-1',
  licenseNumber: 'SIP-2026-0001',
  fullName: 'Dr. Budi Santoso',
  specialtyId: '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111',
  specialty: 'Cardiology',
  phoneNumber: '+628129876543',
  email: 'budi.santoso@clinic.local',
  invitationStatus: 'ACCEPTED',
  degreeValues: [],
  displayName: 'Dr. Budi Santoso',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  patientCount: 4,
  schedules: [
    {
      id: 's1',
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '16:00',
      isAvailable: true,
      maxPatients: null,
    },
    {
      id: 's2',
      dayOfWeek: 2,
      startTime: '08:00',
      endTime: '16:00',
      isAvailable: true,
      maxPatients: null,
    },
  ],
};

const FULL_ACCESS_RULES: AppRule[] = [
  { action: 'read', subject: 'Doctor' },
  { action: 'update', subject: 'Doctor' },
  { action: 'write', subject: 'DoctorSchedule' },
  { action: 'assign', subject: 'DoctorPatient' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'Doctor' }];

function renderRow(
  rules: AppRule[],
  doctor: DoctorListItem = DOCTOR,
  onSendInvitation: (doctor: DoctorListItem) => void = vi.fn(),
): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <AbilityProvider ability={buildAppAbility(rules)}>
        <Table>
          <TableBody>
            <DoctorsTableRow
              doctor={doctor}
              onView={vi.fn()}
              onEdit={vi.fn()}
              onManageSchedule={vi.fn()}
              onAssignPatient={vi.fn()}
              onSendInvitation={onSendInvitation}
            />
          </TableBody>
        </Table>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('DoctorsTableRow', () => {
  it('renders identity, schedule summary, patient count, and status badge', () => {
    renderRow(READ_ONLY_RULES);

    expect(screen.getByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.getByText('SIP-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Sen–Sel · 08:00–16:00')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
  });

  it('warns that a doctor with no NIK cannot be reported to SATUSEHAT', () => {
    renderRow(READ_ONLY_RULES);

    expect(screen.getByText('Tanpa NIK')).toBeInTheDocument();
  });

  it('drops the warning once a NIK is on file', () => {
    renderRow(READ_ONLY_RULES, { ...DOCTOR, nikMasked: '••••••••0001' });

    expect(screen.queryByText('Tanpa NIK')).not.toBeInTheDocument();
  });

  it('shows edit, schedule, and assign actions when the ability allows them', async () => {
    const user = userEvent.setup();
    renderRow(FULL_ACCESS_RULES);

    await user.click(screen.getByRole('button', { name: 'Tindakan untuk Dr. Budi Santoso' }));

    expect(await screen.findByText('Lihat')).toBeInTheDocument();
    expect(screen.getByText('Ubah')).toBeInTheDocument();
    expect(screen.getByText('Kelola Jadwal')).toBeInTheDocument();
    expect(screen.getByText('Tetapkan Pasien')).toBeInTheDocument();
  });

  it('hides privileged actions for read-only abilities', async () => {
    const user = userEvent.setup();
    renderRow(READ_ONLY_RULES);

    await user.click(screen.getByRole('button', { name: 'Tindakan untuk Dr. Budi Santoso' }));

    expect(await screen.findByText('Lihat')).toBeInTheDocument();
    expect(screen.queryByText('Ubah')).not.toBeInTheDocument();
    expect(screen.queryByText('Kelola Jadwal')).not.toBeInTheDocument();
    expect(screen.queryByText('Tetapkan Pasien')).not.toBeInTheDocument();
  });

  describe('a doctor with no account (P20-T01)', () => {
    const NO_ACCOUNT_DOCTOR: DoctorListItem = {
      ...DOCTOR,
      email: undefined,
      invitationStatus: 'NO_ACCOUNT',
    };

    it('is badged rather than left blank', () => {
      renderRow(READ_ONLY_RULES, NO_ACCOUNT_DOCTOR);

      expect(screen.getByText('BELUM ADA AKUN')).toBeInTheDocument();
    });

    it('offers Send Invitation and hands the doctor to the caller', async () => {
      const user = userEvent.setup();
      const mockOnSendInvitation = vi.fn();
      renderRow(FULL_ACCESS_RULES, NO_ACCOUNT_DOCTOR, mockOnSendInvitation);

      await user.click(screen.getByRole('button', { name: 'Tindakan untuk Dr. Budi Santoso' }));
      await user.click(await screen.findByText('Kirim Undangan'));

      expect(mockOnSendInvitation).toHaveBeenCalledWith(NO_ACCOUNT_DOCTOR);
    });

    it('does not offer it to a viewer who cannot update doctors', async () => {
      const user = userEvent.setup();
      renderRow(READ_ONLY_RULES, NO_ACCOUNT_DOCTOR);

      await user.click(screen.getByRole('button', { name: 'Tindakan untuk Dr. Budi Santoso' }));

      expect(await screen.findByText('Lihat')).toBeInTheDocument();
      expect(screen.queryByText('Kirim Undangan')).not.toBeInTheDocument();
    });
  });

  it('does not offer Send Invitation once the doctor has an account', async () => {
    const user = userEvent.setup();
    renderRow(FULL_ACCESS_RULES);

    await user.click(screen.getByRole('button', { name: 'Tindakan untuk Dr. Budi Santoso' }));

    expect(await screen.findByText('Lihat')).toBeInTheDocument();
    expect(screen.queryByText('Kirim Undangan')).not.toBeInTheDocument();
  });
});
