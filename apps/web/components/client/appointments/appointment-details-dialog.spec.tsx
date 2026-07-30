import type { AppointmentListItem, AppointmentStatusValue } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppointmentDetailsDialog } from './appointment-details-dialog';
import { appointmentManagementControllerUpdateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/appointment-management/appointment-management', () => ({
  appointmentManagementControllerUpdateAppointmentV1: vi.fn(),
}));

const updateRequestMock = vi.mocked(appointmentManagementControllerUpdateAppointmentV1);

const FULL_ACCESS_RULES: AppRule[] = [
  { action: 'read', subject: 'Appointment' },
  { action: 'update', subject: 'Appointment' },
  { action: 'cancel', subject: 'Appointment' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'Appointment' }];

function buildAppointment(status: AppointmentStatusValue): AppointmentListItem {
  return {
    id: 'appointment-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    type: 'SPECIAL_REQUEST',
    scheduledAt: '2026-07-21T03:30:00.000Z',
    status,
    reason: 'Routine check',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'John Doe' },
    doctor: { id: 'doctor-1', fullName: 'Dr. Budi Santoso', specialty: 'Cardiology' },
  };
}

function buildRejectedTransitionError(): AxiosError {
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
        error: {
          code: 'CONFLICT',
          message: 'Appointment status can not change from SCHEDULED to CONFIRMED',
        },
      },
    } as AxiosResponse,
  );
}

function renderDialog(params: {
  status: AppointmentStatusValue;
  rules: AppRule[];
  onOpenChange?: (open: boolean) => void;
}): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(params.rules)}>
        <QueryClientProvider client={queryClient}>
          <AppointmentDetailsDialog
            open
            onOpenChange={params.onOpenChange ?? vi.fn()}
            appointment={buildAppointment(params.status)}
            onReschedule={vi.fn()}
            onCancel={vi.fn()}
          />
        </QueryClientProvider>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('AppointmentDetailsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers only the transitions allowed from SCHEDULED', () => {
    renderDialog({ status: 'SCHEDULED', rules: FULL_ACCESS_RULES });

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark No-Show' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reschedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Appointment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Completed' })).not.toBeInTheDocument();
  });

  it('offers only the transitions allowed from CONFIRMED', () => {
    renderDialog({ status: 'CONFIRMED', rules: FULL_ACCESS_RULES });

    expect(screen.getByRole('button', { name: 'Mark Completed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('offers no lifecycle actions for terminal statuses', () => {
    renderDialog({ status: 'COMPLETED', rules: FULL_ACCESS_RULES });

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark No-Show' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Appointment' })).not.toBeInTheDocument();
  });

  it('hides mutation actions from read-only abilities', () => {
    renderDialog({ status: 'SCHEDULED', rules: READ_ONLY_RULES });

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Appointment' })).not.toBeInTheDocument();
  });

  it('applies an allowed transition and closes the dialog', async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();
    updateRequestMock.mockResolvedValue({
      status: 200,
      data: { data: buildAppointment('CONFIRMED') },
    } as AxiosResponse);
    renderDialog({ status: 'SCHEDULED', rules: FULL_ACCESS_RULES, onOpenChange: handleOpenChange });

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(handleOpenChange).toHaveBeenCalledWith(false));
    expect(updateRequestMock).toHaveBeenCalledWith('appointment-1', { status: 'CONFIRMED' });
  });

  it('renders the API message when a transition is rejected', async () => {
    const user = userEvent.setup();
    updateRequestMock.mockRejectedValue(buildRejectedTransitionError());
    renderDialog({ status: 'SCHEDULED', rules: FULL_ACCESS_RULES });

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Appointment status can not change from SCHEDULED to CONFIRMED',
    );
  });
});
