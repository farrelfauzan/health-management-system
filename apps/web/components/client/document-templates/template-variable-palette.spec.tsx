import { INVOICE_TEMPLATE_VARIABLES } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';
import { TemplateVariablePalette } from './template-variable-palette';

function renderPalette(onInsert = vi.fn()) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <TemplateVariablePalette
        variables={INVOICE_TEMPLATE_VARIABLES}
        disabled={false}
        onInsert={onInsert}
      />
    </NextIntlClientProvider>,
  );
  return onInsert;
}

describe('TemplateVariablePalette', () => {
  it('surfaces patient.mrn with its label and sample when searching "mrn" (US-E1-03)', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByPlaceholderText('Cari variabel, mis. mrn'), 'mrn');
    const item = screen.getByTestId('palette-item-patient.mrn');
    expect(item).toHaveTextContent('Nomor rekam medis');
    expect(item).toHaveTextContent('{{patient.mrn}}');
    expect(item).toHaveTextContent('RM-000142');
    expect(screen.queryByTestId('palette-item-clinic.name')).not.toBeInTheDocument();
  });
  it('groups the registry by prefix and keeps item.* columns out of the palette', () => {
    renderPalette();
    const headings = [...document.querySelectorAll('[cmdk-group-heading]')].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual([
      'Klinik',
      'Faktur',
      'Pasien',
      'Kunjungan',
      'Rawat inap',
      'Pembayaran',
      'Rincian tagihan',
    ]);
    expect(screen.queryByTestId('palette-item-item.description')).not.toBeInTheDocument();
  });
  it('hands the selected variable to onInsert', async () => {
    const user = userEvent.setup();
    const onInsert = renderPalette();
    await user.click(screen.getByTestId('palette-item-patient.mrn'));
    expect(onInsert).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'patient.mrn', type: 'text' }),
    );
  });
});
