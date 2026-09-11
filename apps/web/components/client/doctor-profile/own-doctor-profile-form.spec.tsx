import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DoctorDetail } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnDoctorProfileForm } from './own-doctor-profile-form';
import { doctorOwnProfileControllerUpdateOwnDoctorProfileV1 } from '#lib/api/generated/doctor-management/doctor-management';
import messages from '../../../messages/id/clinical.json';

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorOwnProfileControllerUpdateOwnDoctorProfileV1: vi.fn(),
  getDoctorOwnProfileControllerGetOwnDoctorProfileV1QueryKey: () => ['/api/v1/me/doctor-profile'],
}));

vi.mock('#lib/doctors/invalidate-doctor-queries', () => ({
  invalidateDoctorQueries: vi.fn(),
}));

// The catalog-backed pickers load their options over HTTP; their behaviour is
// covered where they live. Here they only need to exist and report a value.
vi.mock('#components/client/doctors/doctor-title-select', () => ({
  DoctorTitleSelect: () => <div data-testid="title-select" />,
}));
vi.mock('#components/client/doctors/doctor-degrees-picker', () => ({
  DoctorDegreesPicker: () => <div data-testid="degrees-picker" />,
}));
vi.mock('#components/client/doctors/doctor-educations-field', () => ({
  DoctorEducationsField: () => <div data-testid="educations-field" />,
}));
vi.mock('#components/client/doctors/credential-catalog-hint', () => ({
  CredentialCatalogHint: () => null,
}));

const updateRequestMock = vi.mocked(doctorOwnProfileControllerUpdateOwnDoctorProfileV1);

const DOCTOR: DoctorDetail = {
  id: 'doctor-1',
  licenseNumber: 'STR-33-2020-000123',
  fullName: 'Budi Santoso',
  specialtyId: '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111',
  specialty: 'Penyakit Dalam',
  phoneNumber: '628129876543',
  email: 'budi.santoso@clinic.local',
  invitationStatus: 'ACCEPTED',
  titleValue: { code: 'DR', label: 'dr.', isLegacy: false },
  degreeValues: [{ code: 'SP_PD', label: 'Sp.PD', isLegacy: false }],
  displayName: 'dr. Budi Santoso, Sp.PD',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  patientCount: 0,
  schedules: [],
  licenses: [],
  educations: [],
};

function renderForm(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <OwnDoctorProfileForm doctor={DOCTOR} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('OwnDoctorProfileForm (P20-T03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: DOCTOR, message: 'Profile updated' },
    } as never);
  });

  it('starts from what the profile holds', () => {
    renderForm();

    expect(screen.getByLabelText(/Nama Lengkap/)).toHaveValue('Budi Santoso');
  });

  it('sends only the fields a doctor owns — never specialty, licences, NIK or status', async () => {
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByLabelText(/Nama Lengkap/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Budi Santoso Putra');
    await user.click(screen.getByRole('button', { name: 'Simpan perubahan' }));

    expect(updateRequestMock).toHaveBeenCalledTimes(1);
    const [actualPayload] = updateRequestMock.mock.calls[0] ?? [];
    expect(actualPayload).toEqual({
      fullName: 'Budi Santoso Putra',
      phoneNumber: '628129876543',
      title: 'DR',
      degrees: ['SP_PD'],
      educations: [],
    });
  });

  it('refuses a blank name before sending anything', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText(/Nama Lengkap/));
    await user.click(screen.getByRole('button', { name: 'Simpan perubahan' }));

    expect(updateRequestMock).not.toHaveBeenCalled();
  });
});
