import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClinicProfileSettingsCard } from './clinic-profile-settings-card';
import operationsMessages from '../../../messages/en/operations.json';

const getProfileMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/clinic-profile/clinic-profile', () => ({
  clinicProfileControllerGetClinicProfileV1: getProfileMock,
  getClinicProfileControllerGetClinicProfileV1QueryKey: () => ['clinic-profile'],
}));

function buildNotFoundError(): Error {
  return Object.assign(new Error('Not Found'), {
    isAxiosError: true,
    response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'not configured' } } },
  });
}

function renderCard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={operationsMessages} timeZone="Asia/Jakarta">
        <ClinicProfileSettingsCard href="/admin/administration?tab=clinic" icon="apartment" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * SJ-156. The one attention state the hub starts with: a clinic with no
 * profile row is told so here, before a document render fails for it.
 */
describe('ClinicProfileSettingsCard', () => {
  beforeEach(() => {
    getProfileMock.mockReset();
  });

  it('shows the attention state while no profile row exists', async () => {
    getProfileMock.mockRejectedValue(buildNotFoundError());
    renderCard();

    expect(await screen.findByTestId('settings-card-attention')).toBeInTheDocument();
    expect(screen.getByText(/not configured yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute(
      'href',
      '/admin/administration?tab=clinic',
    );
  });

  it('loses the attention state once a profile exists', async () => {
    getProfileMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          name: 'Klinik Sehat Bersama',
          hasLogo: false,
          updatedAt: '2026-09-09T00:00:00.000Z',
        },
      },
    });
    renderCard();

    await waitFor(() => expect(getProfileMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId('settings-card-attention')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Clinic profile')).toBeInTheDocument();
  });

  it('does not claim attention on an unrelated failure', async () => {
    getProfileMock.mockRejectedValue(new Error('network down'));
    renderCard();

    await waitFor(() => expect(getProfileMock).toHaveBeenCalled());
    expect(screen.queryByTestId('settings-card-attention')).not.toBeInTheDocument();
  });
});
