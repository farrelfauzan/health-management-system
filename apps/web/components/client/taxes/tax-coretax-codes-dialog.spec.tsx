import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaxAssignmentRowView } from '@hms/shared-types';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const bulkAssignCoretaxMock = vi.fn();

vi.mock('#lib/api/generated/tax-codes/tax-codes', () => ({
  taxAssignmentControllerBulkAssignCoretaxCodesV1: (...args: unknown[]) =>
    bulkAssignCoretaxMock(...args),
}));

const { TaxCoretaxCodesDialog } = await import('./tax-coretax-codes-dialog');

const ROWS: TaxAssignmentRowView[] = [
  {
    kind: 'MEDICATION',
    id: 'med-1',
    code: 'AMOX',
    name: 'Amoxicillin',
    source: 'OVERRIDE',
    hasCoretaxOverride: true,
  },
];

function renderDialog(onApplied = vi.fn(), onClose = vi.fn()): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient()}>
        <TaxCoretaxCodesDialog rows={ROWS} onClose={onClose} onApplied={onApplied} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaxCoretaxCodesDialog (P27-T09)', () => {
  beforeEach(() => {
    bulkAssignCoretaxMock.mockReset();
  });

  it('refuses an item code without a unit', async () => {
    renderDialog();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText(/Isi kode barang\/jasa enam digit/)).toBeInTheDocument();
    expect(bulkAssignCoretaxMock).not.toHaveBeenCalled();
  });

  it('clears the override when both fields are left blank', async () => {
    bulkAssignCoretaxMock.mockResolvedValue({ status: 200, data: { data: { updatedCount: 1 } } });
    const onApplied = vi.fn();
    renderDialog(onApplied);

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(bulkAssignCoretaxMock).toHaveBeenCalledWith({
      targets: [{ kind: 'MEDICATION', id: 'med-1' }],
      coretaxItemCode: null,
      coretaxUnitCode: null,
    });
  });
});
