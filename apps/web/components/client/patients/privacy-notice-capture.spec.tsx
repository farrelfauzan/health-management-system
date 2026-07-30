import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';
import { PrivacyNoticeCapture } from './privacy-notice-capture';

vi.mock('#lib/patients/use-current-privacy-notice', () => ({
  useCurrentPrivacyNotice: () => ({
    notice: {
      id: 'notice-version-1',
      version: '2026.1',
      effectiveAt: '2026-07-01T00:00:00.000Z',
      content: { id: 'Isi pemberitahuan yang tidak dapat diubah.', en: 'Immutable notice.' },
      contentHash: { id: 'hash-id', en: 'hash-en' },
      counselApproved: false,
    },
    isPending: false,
    isError: false,
  }),
}));

function renderCapture(isPatientOwnVariant: boolean): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <PrivacyNoticeCapture
        isEnabled
        isPatientOwnVariant={isPatientOwnVariant}
        onChange={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('PrivacyNoticeCapture', () => {
  it('shows the immutable notice, legal review warning, and consent boundary', () => {
    renderCapture(false);

    expect(screen.getByText('Isi pemberitahuan yang tidak dapat diubah.')).toBeInTheDocument();
    expect(screen.getByText(/belum disetujui/i)).toBeInTheDocument();
    expect(screen.getByText(/bukan persetujuan menyeluruh/i)).toBeInTheDocument();
  });

  it('allows staff representative capture and emergency deferral', () => {
    renderCapture(false);

    expect(screen.getByText('Penerima pemberitahuan')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Hasil penyampaian' })).toHaveAttribute(
      'data-allowed-outcomes',
      'ACKNOWLEDGED,PROVIDED_ACKNOWLEDGEMENT_DECLINED,DEFERRED_EMERGENCY',
    );
  });

  it('does not offer representative or emergency deferral to the patient-own variant', () => {
    renderCapture(true);

    expect(screen.queryByText('Penerima pemberitahuan')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Hasil penyampaian' })).toHaveAttribute(
      'data-allowed-outcomes',
      'ACKNOWLEDGED,PROVIDED_ACKNOWLEDGEMENT_DECLINED',
    );
  });
});
