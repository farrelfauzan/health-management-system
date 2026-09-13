import type { SatusehatRecordComparisonView } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const { useComparisonMock, refetchMock } = vi.hoisted(() => ({
  useComparisonMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock('#lib/encounters/use-satusehat-record-comparison', () => ({
  useSatusehatRecordComparison: (encounterId: string, isRequested: boolean) =>
    useComparisonMock(encounterId, isRequested),
}));

const { EncounterSatusehatRecordCard } = await import('./encounter-satusehat-record-card');

function buildComparison(
  overrides: Partial<SatusehatRecordComparisonView> = {},
): SatusehatRecordComparisonView {
  return {
    encounterId: 'encounter-1',
    submissionId: 'submission-1',
    isSubmitted: true,
    hasResourceList: true,
    checkedAt: '2026-07-29T04:10:00.000Z',
    lines: [
      {
        category: 'VITAL_SIGN',
        code: '8480-6',
        display: 'Systolic blood pressure',
        ours: '120 mmHg',
        satusehat: '130 mmHg',
        outcome: 'DIFFERS',
        notSentReason: null,
      },
      {
        category: 'MEDICATION',
        code: null,
        display: 'Paracetamol 500 mg',
        ours: 'Paracetamol 500 mg',
        satusehat: null,
        outcome: 'NOT_SENT',
        notSentReason: 'NO_KFA_CODE',
      },
    ],
    unreadableResourceCount: 0,
    ...overrides,
  };
}

function mockHook(comparison: SatusehatRecordComparisonView | undefined): void {
  useComparisonMock.mockReturnValue({
    comparison,
    error: null,
    isFetching: false,
    refetch: refetchMock,
  });
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <EncounterSatusehatRecordCard encounterId="encounter-1" />
    </NextIntlClientProvider>,
  );
}

describe('EncounterSatusehatRecordCard', () => {
  beforeEach(() => {
    useComparisonMock.mockReset();
    refetchMock.mockReset();
  });

  it('reads nothing from SATUSEHAT until the doctor asks', async () => {
    mockHook(undefined);
    renderCard();

    expect(useComparisonMock).toHaveBeenLastCalledWith('encounter-1', false);
    expect(screen.getByText(/Tidak ada data yang dibaca dari SATUSEHAT/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Periksa dengan SATUSEHAT/ }));

    expect(useComparisonMock).toHaveBeenLastCalledWith('encounter-1', true);
  });

  it('shows both values for a differing line and the reason for an unsent one', async () => {
    mockHook(buildComparison());
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /Periksa lagi/ }));

    expect(screen.getByText('Berbeda')).toBeInTheDocument();
    expect(screen.getByText(/Klinik: 120 mmHg · SATUSEHAT: 130 mmHg/)).toBeInTheDocument();
    expect(screen.getByText(/Tidak dikirim · tanpa kode KFA/)).toBeInTheDocument();
  });

  it('re-reads on a second click rather than trusting the cached answer', async () => {
    mockHook(buildComparison());
    renderCard();
    const button = screen.getByRole('button', { name: /Periksa lagi/ });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('warns that missing lines may be unread rather than absent', () => {
    mockHook(buildComparison({ unreadableResourceCount: 2 }));
    renderCard();

    expect(screen.getByText(/2 data tidak dapat dibaca dari SATUSEHAT/)).toBeInTheDocument();
  });

  it('says so when the visit was never sent', () => {
    mockHook(buildComparison({ isSubmitted: false, hasResourceList: false, submissionId: null }));
    renderCard();

    expect(screen.getByText(/belum dikirim ke SATUSEHAT/)).toBeInTheDocument();
  });
});
