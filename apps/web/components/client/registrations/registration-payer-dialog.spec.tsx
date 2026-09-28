import type { RegistrationListItem } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistrationPayerDialog } from './registration-payer-dialog';
import { registrationFlowControllerUpdateRegistrationV1 } from '#lib/api/generated/registration-flow/registration-flow';
import messages from '../../../messages/id/operations.json';

vi.mock('#lib/api/generated/registration-flow/registration-flow', () => ({
  registrationFlowControllerUpdateRegistrationV1: vi.fn(),
}));

const updateRequestMock = vi.mocked(registrationFlowControllerUpdateRegistrationV1);

const REGISTRATION: RegistrationListItem = {
  id: 'registration-1',
  patientId: 'patient-1',
  status: 'COMPLETED',
  registeredAt: '2026-09-18T08:00:00.000Z',
  createdAt: '2026-09-18T08:00:00.000Z',
  updatedAt: '2026-09-18T08:00:00.000Z',
  patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'Siti Rahayu', dateOfBirth: '1990-01-01' },
};

function renderDialog(onOpenChange = vi.fn()): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <RegistrationPayerDialog open onOpenChange={onOpenChange} registration={REGISTRATION} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('RegistrationPayerDialog', () => {
  beforeEach(() => {
    updateRequestMock.mockReset();
  });

  it('asks for a payer before saving a visit that never recorded one', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(screen.getByText('Pilih penjamin kunjungan ini.')).toBeInTheDocument();
    expect(updateRequestMock).not.toHaveBeenCalled();
  });

  it('saves the chosen payer on the registration and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    updateRequestMock.mockResolvedValue({
      status: 200,
      data: { data: { ...REGISTRATION, payerType: 'INSURANCE' } },
    } as Awaited<ReturnType<typeof registrationFlowControllerUpdateRegistrationV1>>);
    renderDialog(onOpenChange);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Asuransi' }));
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(updateRequestMock).toHaveBeenCalledWith('registration-1', { payerType: 'INSURANCE' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
