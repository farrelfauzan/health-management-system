import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const downloadMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/analytics/download-analytics-export', () => ({
  downloadAnalyticsExport: downloadMock,
}));

const { AnalyticsExportDialog } = await import('./analytics-export-dialog');

const FILTER = parseAnalyticsFilterParams({ payer: 'BPJS' }, '2026-09-28');

function renderDialog(onOpenChange = vi.fn()): void {
  render(
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={idAnalyticsMessages}>
      <AnalyticsExportDialog
        open
        onOpenChange={onOpenChange}
        dashboard="finance"
        dashboardTitle="Keuangan"
        filter={FILTER}
      />
    </NextIntlClientProvider>,
  );
}

describe('AnalyticsExportDialog', () => {
  beforeEach(() => {
    downloadMock.mockReset();
  });

  it('offers every finance table ticked, and says the file holds no patient', () => {
    renderDialog();

    expect(
      screen.getByRole('dialog', { name: /Ekspor Keuangan · 1\s*–\s*30 Sep 2026/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(7);
    expect(screen.getByRole('checkbox', { name: 'Metode pembayaran' })).toBeChecked();
    expect(screen.getByText(/tanpa nama atau nomor pasien/)).toBeInTheDocument();
  });

  it('downloads only the tables left ticked, for the filter on screen', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    downloadMock.mockResolvedValue(undefined);
    renderDialog(onOpenChange);

    await user.click(screen.getByRole('checkbox', { name: 'Ringkasan' }));
    await user.click(screen.getByRole('button', { name: 'Unduh CSV' }));

    expect(downloadMock).toHaveBeenCalledWith({
      dashboard: 'finance',
      filter: expect.objectContaining({ from: '2026-09-01', to: '2026-09-30', payerType: 'BPJS' }),
      tableKeys: [
        'revenue-trend',
        'payment-methods',
        'service-types',
        'payers',
        'doctors',
        'outstanding',
      ],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks for at least one table instead of downloading an empty file', async () => {
    const user = userEvent.setup();
    renderDialog();

    for (const checkbox of screen.getAllByRole('checkbox')) {
      await user.click(checkbox);
    }
    await user.click(screen.getByRole('button', { name: 'Unduh CSV' }));

    expect(screen.getByText('Pilih minimal satu tabel.')).toBeInTheDocument();
    expect(downloadMock).not.toHaveBeenCalled();
  });
});
