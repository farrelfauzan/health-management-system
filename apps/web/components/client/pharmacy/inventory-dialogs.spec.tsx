import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/pharmacy-inventory.json';
import { MedicationFormDialog } from './medication-form-dialog';
import { ReceiveStockDialog } from './receive-stock-dialog';

function renderDialog(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('pharmacy inventory dialogs', () => {
  it('edits medication metadata and reorder level without exposing absolute stock', () => {
    renderDialog(
      <MedicationFormDialog
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        medication={{
          id: 'medication-1',
          code: 'MED-PARA-500',
          name: 'Paracetamol',
          stockQty: 250,
          reorderLevel: 50,
          needsReorder: false,
    isVaccine: false,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText(/cannot be edited directly/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Reorder level' })).toHaveValue(50);
    expect(screen.queryByRole('spinbutton', { name: 'Stock' })).not.toBeInTheDocument();
  });

  it('requires receipt-oriented lot, expiry, and quantity inputs', () => {
    renderDialog(
      <ReceiveStockDialog
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        medications={[]}
      />,
    );

    expect(screen.getByLabelText('Lot / batch number')).toBeInTheDocument();
    expect(screen.getByLabelText('Expiry date')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Quantity received' })).toBeInTheDocument();
  });
});
