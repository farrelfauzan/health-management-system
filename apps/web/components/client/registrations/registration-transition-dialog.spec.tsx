import type { ReactNode } from 'react';
import type { RegistrationListItem } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistrationTransitionDialog } from './registration-transition-dialog';
import { registrationFlowControllerUpdateRegistrationV1 } from '#lib/api/generated/registration-flow/registration-flow';
import type { RegistrationTransitionTarget } from '#lib/registrations/registration-transition-meta';
import messages from '../../../messages/en/operations.json';

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

vi.mock('#lib/api/generated/registration-flow/registration-flow', () => ({
  registrationFlowControllerUpdateRegistrationV1: vi.fn(),
}));

const updateRequestMock = vi.mocked(registrationFlowControllerUpdateRegistrationV1);

const REGISTRATION: RegistrationListItem = {
  id: 'registration-1',
  patientId: 'patient-1',
  status: 'PENDING',
  registeredAt: '2026-07-18T08:00:00.000Z',
  createdAt: '2026-07-18T08:00:00.000Z',
  updatedAt: '2026-07-18T08:00:00.000Z',
  patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'John Doe' },
};

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
          message: 'Registration status can not change from PENDING to COMPLETED',
        },
      },
    } as AxiosResponse,
  );
}

function renderDialog(params: {
  targetStatus: RegistrationTransitionTarget;
  onOpenChange?: (open: boolean) => void;
}): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <RegistrationTransitionDialog
        open
        onOpenChange={params.onOpenChange ?? vi.fn()}
        registration={REGISTRATION}
        targetStatus={params.targetStatus}
      />
    </QueryClientProvider>,
  );
}

describe('RegistrationTransitionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits the target status and closes on success', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    updateRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: { ...REGISTRATION, status: 'CHECKED_IN' },
        message: 'Registration updated',
      },
    } as never);
    renderDialog({ targetStatus: 'CHECKED_IN', onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Check In' }));

    await waitFor(() => {
      expect(updateRequestMock).toHaveBeenCalledWith('registration-1', { status: 'CHECKED_IN' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('surfaces the API error envelope when the transition is rejected', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    updateRequestMock.mockRejectedValue(buildRejectedTransitionError());
    renderDialog({ targetStatus: 'COMPLETED', onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Complete' }));

    expect(
      await screen.findByText('Registration status can not change from PENDING to COMPLETED'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
