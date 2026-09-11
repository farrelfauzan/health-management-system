import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DoctorInviteAccountDialog } from './doctor-invite-account-dialog';
import { doctorManagementControllerInviteDoctorAccountV1 } from '#lib/api/generated/doctor-management/doctor-management';
import messages from '../../../messages/id/clinical.json';

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorManagementControllerInviteDoctorAccountV1: vi.fn(),
}));

vi.mock('#lib/doctors/invalidate-doctor-queries', () => ({
  invalidateDoctorQueries: vi.fn(),
}));

const inviteRequestMock = vi.mocked(doctorManagementControllerInviteDoctorAccountV1);

function buildPendingConflictError(): AxiosError {
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
          code: 'DOCTOR_INVITATION_ALREADY_PENDING',
          message: 'This doctor already has a pending invitation; resend it from Administration',
        },
      },
    } as AxiosResponse,
  );
}

function renderDialog(onOpenChange: (open: boolean) => void = vi.fn()): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <DoctorInviteAccountDialog
          open
          onOpenChange={onOpenChange}
          doctorId="doctor-1"
          doctorName="Dr. Budi Santoso"
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DoctorInviteAccountDialog (P20-T01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says why a blank address cannot be sent, and sends nothing', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Kirim Undangan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Setiap dokter memerlukan akun untuk masuk',
    );
    expect(inviteRequestMock).not.toHaveBeenCalled();
  });

  it('refuses an address that is not an email', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole('textbox'), 'budi-at-clinic');
    await user.click(screen.getByRole('button', { name: 'Kirim Undangan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('alamat email yang valid');
    expect(inviteRequestMock).not.toHaveBeenCalled();
  });

  it('sends the address for this doctor and closes', async () => {
    const user = userEvent.setup();
    const mockOnOpenChange = vi.fn();
    inviteRequestMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: { data: { id: 'doctor-1', invitationStatus: 'PENDING' }, message: 'Doctor invited' },
    } as never);
    renderDialog(mockOnOpenChange);

    await user.type(screen.getByRole('textbox'), 'budi.santoso@clinic.local');
    await user.click(screen.getByRole('button', { name: 'Kirim Undangan' }));

    expect(inviteRequestMock).toHaveBeenCalledWith('doctor-1', {
      email: 'budi.santoso@clinic.local',
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and shows the API refusal', async () => {
    const user = userEvent.setup();
    const mockOnOpenChange = vi.fn();
    inviteRequestMock.mockRejectedValue(buildPendingConflictError());
    renderDialog(mockOnOpenChange);

    await user.type(screen.getByRole('textbox'), 'budi.santoso@clinic.local');
    await user.click(screen.getByRole('button', { name: 'Kirim Undangan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('pending invitation');
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });
});
