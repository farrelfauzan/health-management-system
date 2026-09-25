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

vi.mock('#lib/api/generated/pharmacy-flow/pharmacy-flow', () => ({
  prescriptionControllerPrintPrescriptionDocumentV1: (...args: unknown[]) => printMock(...args),
}));

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentDetailControllerGetDownloadUrlV1: (...args: unknown[]) => downloadMock(...args),
}));

vi.mock('#lib/api/notify-api-error', () => ({
  notifyApiError: (error: unknown, fallback: string) => notifyErrorMock(error, fallback),
}));

const { PrescriptionDocumentButton } = await import('./prescription-document-button');

const CLINICIAN_RULES: AppRule[] = [
  { action: 'read', subject: 'Prescription' },
  { action: 'read', subject: 'PatientDocument' },
];

function renderButton(rules: AppRule[] = CLINICIAN_RULES): void {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(rules)}>
        <QueryClientProvider client={queryClient}>
          <PrescriptionDocumentButton prescriptionId="prescription-1" encounterId="encounter-1" />
        </QueryClientProvider>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('PrescriptionDocumentButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    printMock.mockResolvedValue({ status: 200, data: { data: { documentId: 'document-1' } } });
    downloadMock.mockResolvedValue({
      status: 200,
      data: { data: { url: 'https://signed.example/resep.pdf' } },
    });
  });

  it('prints the resep and opens the filed PDF, read from this visit', async () => {
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Cetak resep' }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.example/resep.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(printMock).toHaveBeenCalledWith('prescription-1');
    expect(downloadMock).toHaveBeenCalledWith('document-1', { encounterId: 'encounter-1' });
  });

  it('shows the error and opens nothing when the resep cannot be printed', async () => {
    const failure = new Error('PDF renderer is unreachable');
    printMock.mockRejectedValue(failure);
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Cetak resep' }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalledWith(
        failure,
        'Resep tidak dapat dicetak. Silakan coba lagi.',
      );
    });
    expect(window.open).not.toHaveBeenCalled();
  });

  it('is hidden from a user who may not read prescriptions', () => {
    renderButton([{ action: 'read', subject: 'PatientDocument' }]);

    expect(screen.queryByRole('button', { name: 'Cetak resep' })).not.toBeInTheDocument();
  });

  // Issuing needs only prescription read; opening needs the patient file. A
  // caller without it keeps the confirmation instead of an error.
  it('issues without opening for a caller who may not read patient documents', async () => {
    renderButton([{ action: 'read', subject: 'Prescription' }]);

    await userEvent.click(screen.getByRole('button', { name: 'Cetak resep' }));

    await waitFor(() => {
      expect(printMock).toHaveBeenCalledTimes(1);
    });
    expect(downloadMock).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
