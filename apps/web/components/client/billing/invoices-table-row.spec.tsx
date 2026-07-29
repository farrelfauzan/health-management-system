import type { InvoiceListItem, InvoiceStatusValue } from '@hms/shared-types';
import { Table, TableBody } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InvoicesTableRow } from './invoices-table-row';

function buildInvoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: 'invoice-1',
    invoiceNumber: 'INV-2026-000042',
    encounterId: 'encounter-1',
    patientId: 'patient-1',
    patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'John Doe' },
    status: 'DRAFT' as InvoiceStatusValue,
    totalAmount: 150000,
    itemCount: 3,
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
    ...overrides,
  };
}

function renderRow(invoice: InvoiceListItem, onOpen = vi.fn()): void {
  render(
    <Table>
      <TableBody>
        <InvoicesTableRow invoice={invoice} onOpen={onOpen} />
      </TableBody>
    </Table>,
  );
}

describe('InvoicesTableRow', () => {
  it('renders the invoice number, patient, and status', () => {
    renderRow(buildInvoice());

    expect(screen.getByText('INV-2026-000042')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('MRN-0001')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });

  it('formats the total as rupiah rather than a bare number', () => {
    renderRow(buildInvoice({ totalAmount: 150000 }));

    expect(screen.getByText(/Rp\s?150\.000/)).toBeInTheDocument();
  });

  it('opens the invoice through the callback', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderRow(buildInvoice(), onOpen);

    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
