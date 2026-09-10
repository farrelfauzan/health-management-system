import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/pharmacy-inventory.json';
import sharedMessages from '../../../messages/en/shared.json';
import { MedicationFormDialog } from './medication-form-dialog';
import { ReceiveStockDialog } from './receive-stock-dialog';

function renderDialog(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ...messages, ...sharedMessages }}>
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

  it('explains the non-obvious medication fields and leaves the obvious ones uncluttered', () => {
    renderDialog(
      <MedicationFormDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} medication={null} />,
    );

    expect(screen.getByRole('textbox', { name: /^Medication code/ })).toHaveAccessibleDescription(
      "Your clinic's internal code, unique per item",
    );
    expect(screen.getByRole('spinbutton', { name: 'Reorder level' })).toHaveAccessibleDescription(
      'Stock level that triggers a reorder warning on the inventory tab',
    );
    expect(screen.getByRole('checkbox', { name: 'Vaccine' })).toHaveAccessibleDescription(
      'Shows this item in the immunisation picker',
    );
    expect(screen.getByRole('textbox', { name: /^Medication name/ })).toHaveAttribute(
      'placeholder',
      'Paracetamol',
    );
    expect(screen.getByRole('textbox', { name: 'Dosage form' })).toHaveAttribute(
      'placeholder',
      'Tablet',
    );
    expect(screen.getByRole('textbox', { name: 'Strength' })).toHaveAttribute(
      'placeholder',
      '500 mg',
    );
    expect(screen.getByRole('textbox', { name: /^Medication name/ })).not.toHaveAccessibleDescription();
  });

  it('keeps the KFA tooltip trigger out of the KFA input name', () => {
    renderDialog(
      <MedicationFormDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} medication={null} />,
    );

    expect(screen.getByRole('textbox', { name: 'KFA code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More about KFA code' })).toBeInTheDocument();
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

    expect(screen.getByLabelText(/^Lot \/ batch number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Expiry date/)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /^Quantity received/ })).toBeInTheDocument();
  });

  it('explains the receipt fields a pharmacist could misread', () => {
    renderDialog(
      <ReceiveStockDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} medications={[]} />,
    );

    expect(screen.getByRole('textbox', { name: /^Lot \/ batch number/ })).toHaveAccessibleDescription(
      "The manufacturer's lot number printed on the packaging; each lot is tracked separately for expiry",
    );
    expect(screen.getByRole('spinbutton', { name: /^Quantity received/ })).toHaveAccessibleDescription(
      "Count in the medication's stock unit (for example tablets), not packs",
    );
    expect(screen.getByLabelText('Received at')).toHaveAccessibleDescription(
      'Leave empty to record the current time',
    );
    expect(screen.getByLabelText(/^Expiry date/)).not.toHaveAccessibleDescription();
    expect(screen.getByRole('textbox', { name: 'Receipt notes' })).toHaveAttribute(
      'placeholder',
      'Supplier, invoice, or delivery note number',
    );
  });
});
