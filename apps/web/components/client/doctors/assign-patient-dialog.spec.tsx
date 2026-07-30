import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { AssignPatientDialog } from './assign-patient-dialog';
import { doctorPatientControllerAssignDoctorToPatientV1 } from '#lib/api/generated/doctor-patient/doctor-patient';
import { patientManagementControllerListPatientsV1 } from '#lib/api/generated/patient-management/patient-management';
import messages from '../../../messages/id/clinical.json';

vi.mock('#lib/api/generated/doctor-patient/doctor-patient', () => ({
  doctorPatientControllerAssignDoctorToPatientV1: vi.fn(),
}));

vi.mock('#lib/api/generated/patient-management/patient-management', () => ({
  patientManagementControllerListPatientsV1: vi.fn(),
  getPatientManagementControllerListPatientsV1QueryKey: (params?: unknown) => ['patients', params],
}));

const assignRequestMock = vi.mocked(doctorPatientControllerAssignDoctorToPatientV1);
const patientsRequestMock = vi.mocked(patientManagementControllerListPatientsV1);

function buildConflictError(): AxiosError {
  return new AxiosError(
    'Request failed with status code 409',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: {},
      data: {
        error: { code: 'CONFLICT', message: 'Patient is already assigned to this doctor' },
      },
    } as AxiosResponse,
  );
}

function renderDialog(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <AssignPatientDialog
          open
          onOpenChange={vi.fn()}
          doctorId="doctor-1"
          doctorName="Dr. Budi Santoso"
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('AssignPatientDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    patientsRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: [
          {
            id: 'patient-1',
            mrn: 'MRN-2026-0001',
            fullName: 'Aisha Rahman',
            dateOfBirth: '1990-05-12',
            sex: 'FEMALE',
            status: 'OUT_PATIENT',
            phoneNumber: '+628123456789',
            address: 'Jakarta',
            isActive: true,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-10T00:00:00.000Z',
            doctorCount: 0,
            doctors: [],
          },
        ],
        meta: { page: 1, limit: 100, total: 1 },
      },
    } as never);
  });

  it('assigns the selected patient through the doctor-patient endpoint', async () => {
    const user = userEvent.setup();
    assignRequestMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: { data: { id: 'assignment-1' }, message: 'Doctor assigned to patient' },
    } as never);
    renderDialog();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Aisha Rahman/ }));
    await user.click(screen.getByRole('button', { name: 'Tetapkan Pasien' }));

    expect(assignRequestMock).toHaveBeenCalledWith({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
    });
  });

  it('surfaces duplicate-assignment conflicts from the API', async () => {
    const user = userEvent.setup();
    assignRequestMock.mockRejectedValue(buildConflictError());
    renderDialog();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Aisha Rahman/ }));
    await user.click(screen.getByRole('button', { name: 'Tetapkan Pasien' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pasien ini sudah ditetapkan kepada dokter.',
    );
  });
});
