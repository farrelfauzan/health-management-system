import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnAccountNikForm } from './own-account-nik-form';
import { ownAccountControllerUpdateOwnAccountNikV1 } from '#lib/api/generated/account/account';
import messages from '../../../messages/id/operations.json';

vi.mock('#lib/api/generated/account/account', () => ({
  ownAccountControllerUpdateOwnAccountNikV1: vi.fn(),
  getOwnAccountControllerGetOwnAccountV1QueryKey: () => ['/api/v1/me/account'],
}));

const saveRequestMock = vi.mocked(ownAccountControllerUpdateOwnAccountNikV1);

/** Sixteen digits that are nobody's number. */
const NIK_PLACEHOLDER = '0000000000000000';

function renderForm(nikLast4: string | null): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <OwnAccountNikForm nikLast4={nikLast4} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('OwnAccountNikForm (P24-T15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: { id: 'user-1', email: 'desk@klinik.id', fullName: 'Rani', nikLast4: '0000' },
        message: 'NIK saved',
      },
    } as never);
  });

  it('says no NIK is on file and offers to add one', () => {
    renderForm(null);

    expect(screen.getByTestId('own-account-nik-current')).toHaveTextContent(
      'Belum ada NIK tersimpan di akun ini.',
    );
    expect(screen.getByLabelText(/NIK \(16 digit\)/)).toHaveValue('');
  });

  it('shows a stored NIK masked to its last four digits and never in full', () => {
    renderForm('1234');

    expect(screen.getByTestId('own-account-nik-current')).toHaveTextContent(
      'NIK tersimpan: •••••••••••• 1234',
    );
    expect(screen.getByLabelText(/NIK baru \(16 digit\)/)).toHaveValue('');
  });

  it('refuses anything but sixteen digits before calling the API', async () => {
    renderForm(null);

    await userEvent.type(screen.getByLabelText(/NIK \(16 digit\)/), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan NIK' }));

    expect(await screen.findByText('NIK harus terdiri dari 16 digit angka.')).toBeInTheDocument();
    expect(saveRequestMock).not.toHaveBeenCalled();
  });

  it('sends the sixteen digits to the account route', async () => {
    renderForm(null);

    await userEvent.type(screen.getByLabelText(/NIK \(16 digit\)/), NIK_PLACEHOLDER);
    await userEvent.click(screen.getByRole('button', { name: 'Simpan NIK' }));

    await waitFor(() => expect(saveRequestMock).toHaveBeenCalledTimes(1));
    expect(saveRequestMock).toHaveBeenCalledWith({ nik: NIK_PLACEHOLDER });
  });
});
