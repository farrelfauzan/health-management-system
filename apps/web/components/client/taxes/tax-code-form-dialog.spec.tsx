import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import operationsMessages from '../../../messages/id/operations.json';
import sharedMessages from '../../../messages/id/shared.json';

const messages = { ...sharedMessages, ...operationsMessages };

const createTaxCodeMock = vi.fn();

vi.mock('#lib/api/generated/tax-codes/tax-codes', () => ({
  taxCodeControllerCreateTaxCodeV1: (...args: unknown[]) => createTaxCodeMock(...args),
  taxCodeControllerUpdateTaxCodeV1: vi.fn(),
}));

const { TaxCodeFormDialog } = await import('./tax-code-form-dialog');

describe('TaxCodeFormDialog (P27-T03)', () => {
  beforeEach(() => {
    createTaxCodeMock.mockReset();
  });

  it('prefills a new taxed code with 12% × 11/12 and refuses it without a start date', () => {
    render(
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <QueryClientProvider client={new QueryClient()}>
          <TaxCodeFormDialog onClose={vi.fn()} />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText(/Tarif \(%\)/)).toHaveValue('12');
    expect(screen.getByLabelText(/Pembilang DPP/)).toHaveValue('11');
    fireEvent.change(screen.getByRole('textbox', { name: /^Kode/ }), { target: { value: 'estetika' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Nama/ }), { target: { value: 'Perawatan estetika' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(screen.getByText(/Periksa kode/)).toBeInTheDocument();
    expect(createTaxCodeMock).not.toHaveBeenCalled();
  });
});
