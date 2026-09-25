import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const printMock = vi.hoisted(() => vi.fn());
const downloadMock = vi.hoisted(() => vi.fn());
const notifyErrorMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/laboratory-orders/laboratory-orders', () => ({
  labOrderControllerPrintRequestLetterV1: (...args: unknown[]) => printMock(...args),
}));

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentDetailControllerGetDownloadUrlV1: (...args: unknown[]) => downloadMock(...args),
}));

vi.mock('#lib/api/notify-api-error', () => ({
  notifyApiError: (error: unknown, fallback: string) => notifyErrorMock(error, fallback),
}));

const { LabRequestDocumentButton } = await import('./lab-request-document-button');

const CLINICIAN_RULES: AppRule[] = [
  { action: 'read', subject: 'LabOrder' },
  { action: 'read', subject: 'PatientDocument' },
];

function renderButton(rules: AppRule[] = CLINICIAN_RULES): void {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(rules)}>
        <QueryClientProvider client={queryClient}>
          <LabRequestDocumentButton labOrderId="order-1" encounterId="encounter-1" />
        </QueryClientProvider>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('LabRequestDocumentButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    printMock.mockResolvedValue({ status: 200, data: { data: { documentId: 'document-7' } } });
    downloadMock.mockResolvedValue({
      status: 200,
      data: { data: { url: 'https://signed.example/pengantar.pdf' } },
    });
  });

  it('prints the surat pengantar and opens it', async () => {
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Cetak surat pengantar' }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.example/pengantar.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(printMock).toHaveBeenCalledWith('order-1');
    expect(downloadMock).toHaveBeenCalledWith('document-7', { encounterId: 'encounter-1' });
  });

  it('shows the error and opens nothing when the letter cannot be printed', async () => {
    const failure = new Error('The clinic profile has not been configured yet');
    printMock.mockRejectedValue(failure);
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Cetak surat pengantar' }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalledWith(
        failure,
        'Surat pengantar tidak dapat dicetak. Silakan coba lagi.',
      );
    });
    expect(window.open).not.toHaveBeenCalled();
  });

  it('reports a letter that was filed but could not be opened', async () => {
    const failure = new Error('signing failed');
    downloadMock.mockRejectedValue(failure);
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Cetak surat pengantar' }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalledWith(
        failure,
        'Surat pengantar sudah diterbitkan, tetapi tidak dapat dibuka. Buka dari tab Dokumen pasien.',
      );
    });
  });

  it('is hidden from a user who may not read lab orders', () => {
    renderButton([{ action: 'read', subject: 'PatientDocument' }]);

    expect(screen.queryByRole('button', { name: 'Cetak surat pengantar' })).not.toBeInTheDocument();
  });
});
