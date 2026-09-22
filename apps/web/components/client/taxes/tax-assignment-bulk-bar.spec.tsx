import type { TaxAssignmentRowView, TaxCodeView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const bulkAssignMock = vi.fn();

vi.mock('#lib/api/generated/tax-codes/tax-codes', () => ({
  taxAssignmentControllerBulkAssignV1: (...args: unknown[]) => bulkAssignMock(...args),
}));

const { TaxAssignmentBulkBar } = await import('./tax-assignment-bulk-bar');

const ROWS: TaxAssignmentRowView[] = [
  {
    kind: 'SERVICE_TARIFF',
    id: 'tariff-1',
    code: 'FACIAL',
    name: 'Facial',
    source: 'CATEGORY_DEFAULT',
    hasCoretaxOverride: false,
  },
  {
    kind: 'MEDICATION',
    id: 'med-1',
    code: 'AMOX',
    name: 'Amoxicillin',
    source: 'OVERRIDE',
    hasCoretaxOverride: false,
  },
];

function renderBar(selectedKeys: string[], onApplied = vi.fn()): void {
  const queryClient = new QueryClient();
  const taxCodes: TaxCodeView[] = [];
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <TaxAssignmentBulkBar
          rows={ROWS}
          selectedKeys={new Set(selectedKeys)}
          taxCodes={taxCodes}
          onApplied={onApplied}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaxAssignmentBulkBar (P27-T03)', () => {
  beforeEach(() => {
    bulkAssignMock.mockReset();
  });

  it('keeps both actions disabled until something is selected', () => {
    renderBar([]);

    expect(screen.getByRole('button', { name: 'Terapkan kode pajak' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pakai default kategori' })).toBeDisabled();
  });

  it('returns only the selected rows to their category default', async () => {
    const onApplied = vi.fn();
    bulkAssignMock.mockResolvedValue({ status: 200, data: { data: { updatedCount: 1 } } });
    renderBar(['MEDICATION:med-1'], onApplied);

    fireEvent.click(screen.getByRole('button', { name: 'Pakai default kategori' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(bulkAssignMock).toHaveBeenCalledWith({
      targets: [{ kind: 'MEDICATION', id: 'med-1' }],
      taxCodeId: null,
    });
  });
});
