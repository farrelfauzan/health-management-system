import type { DoctorListItem } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, Table, TableBody, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DoctorsTableRow } from './doctors-table-row';

const DOCTOR: DoctorListItem = {
  id: 'doctor-1',
  licenseNumber: 'SIP-2026-0001',
  fullName: 'Dr. Budi Santoso',
  specialty: 'Cardiology',
  phoneNumber: '+628129876543',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  patientCount: 4,
  schedules: [
    { id: 's1', dayOfWeek: 1, startTime: '08:00', endTime: '16:00', isAvailable: true },
    { id: 's2', dayOfWeek: 2, startTime: '08:00', endTime: '16:00', isAvailable: true },
  ],
};

const FULL_ACCESS_RULES: AppRule[] = [
  { action: 'read', subject: 'Doctor' },
  { action: 'update', subject: 'Doctor' },
  { action: 'write', subject: 'DoctorSchedule' },
  { action: 'assign', subject: 'DoctorPatient' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'Doctor' }];

function renderRow(rules: AppRule[]): void {
  render(
    <AbilityProvider ability={buildAppAbility(rules)}>
      <Table>
        <TableBody>
          <DoctorsTableRow
            doctor={DOCTOR}
            onView={vi.fn()}
            onEdit={vi.fn()}
            onManageSchedule={vi.fn()}
            onAssignPatient={vi.fn()}
          />
        </TableBody>
      </Table>
    </AbilityProvider>,
  );
}

describe('DoctorsTableRow', () => {
  it('renders identity, schedule summary, patient count, and status badge', () => {
    renderRow(READ_ONLY_RULES);

    expect(screen.getByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.getByText('SIP-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Mon–Tue · 08:00–16:00')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('shows edit, schedule, and assign actions when the ability allows them', async () => {
    const user = userEvent.setup();
    renderRow(FULL_ACCESS_RULES);

    await user.click(screen.getByRole('button', { name: 'Actions for Dr. Budi Santoso' }));

    expect(await screen.findByText('View')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Manage Schedule')).toBeInTheDocument();
    expect(screen.getByText('Assign Patient')).toBeInTheDocument();
  });

  it('hides privileged actions for read-only abilities', async () => {
    const user = userEvent.setup();
    renderRow(READ_ONLY_RULES);

    await user.click(screen.getByRole('button', { name: 'Actions for Dr. Budi Santoso' }));

    expect(await screen.findByText('View')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage Schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Assign Patient')).not.toBeInTheDocument();
  });
});
