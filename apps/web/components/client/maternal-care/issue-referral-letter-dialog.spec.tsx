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
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock('@hms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hms/ui')>();
  return { ...actual, toast: { ...actual.toast, success: toastSuccessMock } };
});

vi.mock('#lib/api/generated/maternal-care/maternal-care', () => ({
  antenatalExaminationControllerIssueReferralLetterV1: (...args: unknown[]) => issueMock(...args),
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

const { IssueReferralLetterDialog } = await import('./issue-referral-letter-dialog');

const MIDWIFE_RULES: AppRule[] = [
  { action: 'write', subject: 'Encounter' },
  { action: 'read', subject: 'PatientDocument' },
];

function renderDialog(onOpenChange = vi.fn()): void {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(MIDWIFE_RULES)}>
        <QueryClientProvider client={queryClient}>
          <IssueReferralLetterDialog open onOpenChange={onOpenChange} encounterId="encounter-1" />
        </QueryClientProvider>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('IssueReferralLetterDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    issueMock.mockResolvedValue({ status: 201, data: { data: { documentId: 'document-9' } } });
    downloadMock.mockResolvedValue({
      status: 200,
      data: { data: { url: 'https://signed.example/rujukan.pdf' } },
    });
  });

  // The toast alone left the midwife hunting for the letter the patient was
  // waiting to carry to the hospital.
  it('keeps the toast and opens the issued surat rujukan', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    await userEvent.type(screen.getByLabelText(/Tujuan rujukan/), 'RSUD Kota');
    await userEvent.click(screen.getByRole('button', { name: 'Buat surat rujukan' }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.example/rujukan.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(issueMock).toHaveBeenCalledWith('encounter-1', {
      destination: 'RSUD Kota',
      notes: undefined,
    });
    expect(downloadMock).toHaveBeenCalledWith('document-9', { encounterId: 'encounter-1' });
    expect(toastSuccessMock).toHaveBeenCalledWith('Dokumen diterbitkan');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the error and opens nothing when the letter cannot be issued', async () => {
    const failure = new Error('The clinic profile has not been configured yet');
    issueMock.mockRejectedValue(failure);
    renderDialog();

    await userEvent.type(screen.getByLabelText(/Tujuan rujukan/), 'RSUD Kota');
    await userEvent.click(screen.getByRole('button', { name: 'Buat surat rujukan' }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalledWith(
        failure,
        'Dokumen tidak dapat diterbitkan. Silakan coba lagi.',
      );
    });
    expect(window.open).not.toHaveBeenCalled();
  });
});
