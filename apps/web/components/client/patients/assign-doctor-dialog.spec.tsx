import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssignDoctorDialog } from './assign-doctor-dialog';
import { doctorPatientControllerAssignDoctorToPatientV1 } from '#lib/api/generated/doctor-patient/doctor-patient';
import { doctorManagementControllerListDoctorsV1 } from '#lib/api/generated/doctor-management/doctor-management';

vi.mock('#lib/api/generated/doctor-patient/doctor-patient', () => ({
  doctorPatientControllerAssignDoctorToPatientV1: vi.fn(),
}));

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorManagementControllerListDoctorsV1: vi.fn(),
  getDoctorManagementControllerListDoctorsV1QueryKey: (params?: unknown) => ['doctors', params],
}));

const assignRequestMock = vi.mocked(doctorPatientControllerAssignDoctorToPatientV1);
const doctorsRequestMock = vi.mocked(doctorManagementControllerListDoctorsV1);

function buildConflictError(): AxiosError {
  return new AxiosError('Request failed with status code 409', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 409,
    statusText: 'Conflict',
    headers: {},
    config: {},
    data: {
      error: { code: 'CONFLICT', message: 'Doctor is already assigned to this patient' },
    },
  } as AxiosResponse);
}

function renderDialog(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AssignDoctorDialog
        open
        onOpenChange={vi.fn()}
        patientId="patient-1"
        patientName="Aisha Rahman"
      />
    </QueryClientProvider>,
  );
}

describe('AssignDoctorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    doctorsRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: [
          {
            id: 'doctor-1',
            licenseNumber: 'SIP-2026-0001',
            fullName: 'Dr. Budi',
            specialty: 'Cardiology',
            phoneNumber: '+628129876543',
            ownerUserId: 'user-1',
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            patientCount: 1,
          },
        ],
        meta: { page: 1, limit: 100, total: 1 },
      },
    } as never);
  });

  it('requires a doctor selection before assigning', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Assign Doctor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Select a doctor to assign.');
    expect(assignRequestMock).not.toHaveBeenCalled();
  });

  it('surfaces duplicate-assignment conflicts from the API', async () => {
    const user = userEvent.setup();
    assignRequestMock.mockRejectedValue(buildConflictError());
    renderDialog();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Dr\. Budi/ }));
    await user.click(screen.getByRole('button', { name: 'Assign Doctor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This doctor is already assigned to the patient.',
    );
    expect(assignRequestMock).toHaveBeenCalledWith({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
    });
  });
});
