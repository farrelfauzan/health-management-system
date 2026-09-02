import { INVOICE_ITEM_ROW_VARIABLES } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';
import { ItemsColumnsConfig } from './items-columns-config';

function renderConfig(value: Parameters<typeof ItemsColumnsConfig>[0]['value'], onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <ItemsColumnsConfig
        value={value}
        variables={INVOICE_ITEM_ROW_VARIABLES}
        disabled={false}
        isHighlighted={false}
        onChange={onChange}
      />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe('ItemsColumnsConfig', () => {
  it('lists included columns first in print order, then the excluded ones', () => {
    renderConfig(['item.amount', 'item.description']);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.map((box) => box.getAttribute('id'))).toEqual([
      'items-column-item.amount',
      'items-column-item.description',
      'items-column-item.no',
      'items-column-item.quantity',
      'items-column-item.unitPrice',
    ]);
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true');
    expect(checkboxes[2]).toHaveAttribute('aria-checked', 'false');
  });
  it('appends a newly included column and removes an unchecked one', async () => {
    const user = userEvent.setup();
    const onChange = renderConfig(['item.description', 'item.amount']);
    await user.click(screen.getByRole('checkbox', { name: 'Cetak Nomor baris' }));
    expect(onChange).toHaveBeenLastCalledWith(['item.description', 'item.amount', 'item.no']);
    await user.click(screen.getByRole('checkbox', { name: 'Cetak Jumlah harga' }));
    expect(onChange).toHaveBeenLastCalledWith(['item.description']);
  });
  it('moves a column with the arrow buttons and pins the ends', async () => {
    const user = userEvent.setup();
    const onChange = renderConfig(['item.description', 'item.amount']);
    expect(screen.getByRole('button', { name: 'Naikkan Uraian' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Naikkan Jumlah harga' }));
    expect(onChange).toHaveBeenLastCalledWith(['item.amount', 'item.description']);
  });
  it('refuses to uncheck the last remaining column', () => {
    renderConfig(['item.description']);
    expect(screen.getByRole('checkbox', { name: 'Cetak Uraian' })).toBeDisabled();
    expect(screen.getByText('Minimal satu kolom harus tetap ada.')).toBeInTheDocument();
  });
});
