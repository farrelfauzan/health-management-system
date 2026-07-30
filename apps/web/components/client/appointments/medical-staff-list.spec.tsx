import type { ReactNode } from 'react';
import type { DoctorListItem } from '@hms/shared-types';
import { render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { MedicalStaffList } from './medical-staff-list';
import messages from '../../../messages/en/operations.json';

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

function buildDoctor(id: string, fullName: string, specialty: string): DoctorListItem {
  return {
    id,
    licenseNumber: `SIP-2026-${id}`,
    fullName,
    specialtyId: '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111',
    specialty,
    phoneNumber: '+628129876543',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    patientCount: 2,
    schedules: [],
  };
}

const DOCTORS = [
  buildDoctor('doctor-1', 'Dr. Budi Santoso', 'Cardiology'),
  buildDoctor('doctor-2', 'Dr. Maria Garcia', 'Pediatrics'),
];

describe('MedicalStaffList', () => {
  it('checks every doctor when no staff filter is applied', () => {
    render(
      <MedicalStaffList
        doctors={DOCTORS}
        selectedDoctorIds={null}
        isLoading={false}
        onToggleDoctor={vi.fn()}
      />,
    );

    expect(screen.getByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Pediatrics')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Toggle Dr. Budi Santoso' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Toggle Dr. Maria Garcia' })).toBeChecked();
  });

  it('only checks the doctors included in the filter', () => {
    render(
      <MedicalStaffList
        doctors={DOCTORS}
        selectedDoctorIds={['doctor-2']}
        isLoading={false}
        onToggleDoctor={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Toggle Dr. Budi Santoso' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Toggle Dr. Maria Garcia' })).toBeChecked();
  });

  it('reports toggles with the doctor id', async () => {
    const user = userEvent.setup();
    const handleToggleDoctor = vi.fn();
    render(
      <MedicalStaffList
        doctors={DOCTORS}
        selectedDoctorIds={null}
        isLoading={false}
        onToggleDoctor={handleToggleDoctor}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Toggle Dr. Maria Garcia' }));

    expect(handleToggleDoctor).toHaveBeenCalledWith('doctor-2');
  });

  it('shows an empty message when no active doctors exist', () => {
    render(
      <MedicalStaffList
        doctors={[]}
        selectedDoctorIds={null}
        isLoading={false}
        onToggleDoctor={vi.fn()}
      />,
    );

    expect(screen.getByText('No active doctors available.')).toBeInTheDocument();
  });
});
