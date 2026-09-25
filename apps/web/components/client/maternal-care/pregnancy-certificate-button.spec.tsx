import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/maternal-care.json';

const issueMock = vi.hoisted(() => vi.fn());
const downloadMock = vi.hoisted(() => vi.fn());
const notifyErrorMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/maternal-care/maternal-care', () => ({
  antenatalExaminationControllerIssuePregnancyCertificateV1: (...args: unknown[]) =>
    issueMock(...args),
}));

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentDetailControllerGetDownloadUrlV1: (...args: unknown[]) => downloadMock(...args),
}));

vi.mock('#lib/api/notify-api-error', () => ({
  notifyApiError: (error: unknown, fallback: string) => notifyErrorMock(error, fallback),
}));

vi.mock('#lib/maternal-care/invalidate-maternal-care-queries', () => ({
  invalidateMaternalCareQueries: () => Promise.resolve(),
}));

const { PregnancyCertificateButton } = await import('./pregnancy-certificate-button');

const MIDWIFE_RULES: AppRule[] = [
  { action: 'write', subject: 'Encounter' },
  { action: 'read', subject: 'PatientDocument' },
];

function renderButton(rules: AppRule[] = MIDWIFE_RULES): void {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(rules)}>
        <QueryClientProvider client={queryClient}>
          <PregnancyCertificateButton pregnancyEpisodeId="episode-1" />
        </QueryClientProvider>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('PregnancyCertificateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    issueMock.mockResolvedValue({ status: 201, data: { data: { documentId: 'document-3' } } });
    downloadMock.mockResolvedValue({
      status: 200,
      data: { data: { url: 'https://signed.example/skh.pdf' } },
    });
  });

  it('issues the surat keterangan hamil and opens it', async () => {
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Surat keterangan hamil' }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.example/skh.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(issueMock).toHaveBeenCalledWith('episode-1');
    expect(downloadMock).toHaveBeenCalledWith('document-3', undefined);
  });

  it('shows the error and opens nothing when the certificate cannot be issued', async () => {
    const failure = new Error('Pregnancy episode not found');
    issueMock.mockRejectedValue(failure);
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Surat keterangan hamil' }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalledWith(
        failure,
        'Dokumen tidak dapat diterbitkan. Silakan coba lagi.',
      );
    });
    expect(window.open).not.toHaveBeenCalled();
  });

  it('is hidden from a user who may not write encounters', () => {
    renderButton([{ action: 'read', subject: 'Encounter' }]);

    expect(
      screen.queryByRole('button', { name: 'Surat keterangan hamil' }),
    ).not.toBeInTheDocument();
  });
});
