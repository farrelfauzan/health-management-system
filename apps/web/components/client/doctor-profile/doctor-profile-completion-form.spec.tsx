import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DoctorDetail } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DoctorProfileCompletionForm } from './doctor-profile-completion-form';
import { doctorOwnProfileControllerCompleteOwnDoctorProfileV1 } from '#lib/api/generated/doctor-management/doctor-management';
import { refreshSession } from '#lib/api/http';
import messages from '../../../messages/id/clinical.json';

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorOwnProfileControllerCompleteOwnDoctorProfileV1: vi.fn(),
}));

vi.mock('#lib/api/http', () => ({
  refreshSession: vi.fn().mockResolvedValue('fresh-token'),
}));

vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({ specialties: [], isPending: false }),
}));

// Catalog- and HTTP-backed pickers are covered where they live; here they
// only need to exist.
vi.mock('#components/client/doctors/doctor-title-select', () => ({
  DoctorTitleSelect: () => <div data-testid="title-select" />,
}));
vi.mock('#components/client/doctors/doctor-degrees-picker', () => ({
  DoctorDegreesPicker: () => <div data-testid="degrees-picker" />,
}));
vi.mock('#components/client/doctors/specialty-combobox', () => ({
  SpecialtyCombobox: () => <div data-testid="specialty-combobox" />,
}));

const completeRequestMock = vi.mocked(doctorOwnProfileControllerCompleteOwnDoctorProfileV1);
const refreshSessionMock = vi.mocked(refreshSession);

const STARTED_DOCTOR: DoctorDetail = {
  id: 'doctor-1',
  licenseNumber: 'STR-33-2020-000123',
  fullName: 'Budi Santoso',
  specialtyId: '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111',
  specialty: 'Penyakit Dalam',
  phoneNumber: '628129876543',
  email: 'budi.santoso@clinic.local',
  invitationStatus: 'ACCEPTED',
  degreeValues: [],
  displayName: 'Budi Santoso',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  patientCount: 0,
  schedules: [],
  licenses: [],
  educations: [],
};

function renderForm(doctor?: DoctorDetail): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QueryClientProvider client={new QueryClient()}>
        <DoctorProfileCompletionForm doctor={doctor} nextPath="/doctor/encounters" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DoctorProfileCompletionForm (P20-T02)', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignMock },
    });
    completeRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: STARTED_DOCTOR, message: 'Profile completed' },
    } as never);
  });

  it('asks an invited doctor with no profile for their credentials, once', () => {
    renderForm();

    expect(screen.getByTestId('specialty-combobox')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nomor STR/)).toBeInTheDocument();
    expect(screen.getByLabelText(/NIK/)).toBeInTheDocument();
    expect(screen.getByText(/hanya diisi sekali/)).toBeInTheDocument();
  });

  it('asks a doctor whose profile the clinic started only for what is missing', () => {
    renderForm(STARTED_DOCTOR);

    expect(screen.queryByTestId('specialty-combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nomor STR/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/NIK/)).toBeInTheDocument();
  });

  it('offers no credential fields once everything is on file', () => {
    renderForm({ ...STARTED_DOCTOR, nikMasked: '••••••••0002' });

    expect(screen.queryByLabelText(/NIK/)).not.toBeInTheDocument();
  });

  it('saves, re-issues the session, then loads where the doctor was going', async () => {
    const user = userEvent.setup();
    renderForm(STARTED_DOCTOR);

    await user.type(screen.getByLabelText(/NIK/), '3173011503800031');
    await user.click(screen.getByRole('button', { name: 'Simpan dan lanjutkan' }));

    expect(completeRequestMock).toHaveBeenCalledWith({
      fullName: 'Budi Santoso',
      phoneNumber: '628129876543',
      nik: '3173011503800031',
    });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith('/doctor/encounters');
  });
});
