import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';
import { RegisterNewbornDialog } from './register-newborn-dialog';

vi.mock('#lib/patients/use-current-privacy-notice', () => ({
  useCurrentPrivacyNotice: () => ({
    notice: {
      id: 'notice-version-1',
      version: '2026.1',
      effectiveAt: '2026-07-01T00:00:00.000Z',
      content: { id: 'Isi pemberitahuan.', en: 'Notice.' },
      contentHash: { id: 'hash-id', en: 'hash-en' },
      counselApproved: true,
    },
    isPending: false,
    isError: false,
  }),
}));

vi.mock('#lib/api/generated/patient-management/patient-management', () => ({
  patientManagementControllerRegisterNewbornV1: vi.fn(),
}));

function renderDialog(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <RegisterNewbornDialog
          open
          onOpenChange={vi.fn()}
          mother={{
            id: 'mother-1',
            fullName: 'Siti Aminah',
            addressSummary: 'Jl. Merdeka No. 10, Gambir',
          }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('RegisterNewbornDialog', () => {
  it("shows what the baby inherits from her mother rather than asking for it again", () => {
    renderDialog();

    expect(screen.getByText(/Bayi Ny. Siti Aminah/)).toBeInTheDocument();
    expect(screen.getByText(/Jl. Merdeka No. 10, Gambir/)).toBeInTheDocument();
    // The address is stated, never offered as an editable field: a retyped
    // address is how two records of one household drift apart (P24-T10).
    expect(screen.queryByRole('textbox', { name: /alamat/i })).not.toBeInTheDocument();
  });

  it('asks only for what nobody else knows', () => {
    renderDialog();

    expect(screen.getByRole('combobox', { name: 'Jenis kelamin' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tempat lahir')).toBeInTheDocument();
    // A baby has no NIK for weeks, so the form never offers one.
    expect(screen.queryByLabelText(/NIK/i)).not.toBeInTheDocument();
  });
});
