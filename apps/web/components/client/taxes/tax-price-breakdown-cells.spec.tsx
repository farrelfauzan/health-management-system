import type { TaxPriceBreakdownView } from '@hms/shared-types';
import { Table, TableBody, TableRow } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import sharedMessages from '../../../messages/id/shared.json';
import { TaxPriceBreakdownCells } from './tax-price-breakdown-cells';

function renderCells(breakdown?: TaxPriceBreakdownView): void {
  render(
    <NextIntlClientProvider locale="id" messages={sharedMessages} timeZone="Asia/Jakarta">
      <Table>
        <TableBody>
          <TableRow>
            <TaxPriceBreakdownCells breakdown={breakdown} />
          </TableRow>
        </TableBody>
      </Table>
    </NextIntlClientProvider>,
  );
}

describe('TaxPriceBreakdownCells (P27-T04)', () => {
  it('shows the price before PPN and the PPN for a taxed item', () => {
    renderCells({
      kind: 'MEDICATION',
      id: 'med-1',
      status: 'TAXED',
      taxCode: 'BARANG-PPN',
      price: 111_000,
      priceBeforeTax: 100_000,
      taxAmount: 11_000,
    });

    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent?.replace(/\s/g, ''));
    expect(cells).toEqual(['Rp100.000', 'Rp11.000']);
  });

  it('says why there is no PPN for an exempt service', () => {
    renderCells({
      kind: 'SERVICE_TARIFF',
      id: 'tariff-1',
      status: 'EXEMPT',
      taxCode: 'JASA-MEDIS',
      price: 150_000,
      priceBeforeTax: 150_000,
      taxAmount: 0,
    });

    expect(screen.getByText('Dibebaskan')).toBeInTheDocument();
  });

  it('shows dashes when there is nothing to split', () => {
    renderCells(undefined);

    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['—', '—']);
  });
});
