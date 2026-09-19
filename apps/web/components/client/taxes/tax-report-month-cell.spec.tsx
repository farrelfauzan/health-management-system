import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const createReportMock = vi.fn();
const pushMock = vi.fn();

vi.mock('#lib/api/generated/tax-reports/tax-reports', () => ({
  taxReportControllerCreateReportV1: (...args: unknown[]) => createReportMock(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const { TaxReportMonthCell } = await import('./tax-report-month-cell');

function renderCell(props: Partial<Parameters<typeof TaxReportMonthCell>[0]> = {}): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient()}>
        <TaxReportMonthCell
          period="2026-02"
          kind="PP55_OMZET"
          canWrite
          isFuture={false}
          {...props}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaxReportMonthCell (P27-T05)', () => {
  beforeEach(() => {
    createReportMock.mockReset();
    pushMock.mockReset();
  });

  it('drafts an empty month and opens it', async () => {
    createReportMock.mockResolvedValue({ status: 201, data: { data: { id: 'report-feb' } } });
    renderCell();

    fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/taxes/reports/report-feb'));
    expect(createReportMock).toHaveBeenCalledWith({ period: '2026-02', kind: 'PP55_OMZET' });
  });

  it('offers no draft for a month that has not started', () => {
    renderCell({ isFuture: true });

    expect(screen.queryByRole('button', { name: 'Buat draft' })).not.toBeInTheDocument();
  });

  it('marks a finalized month that no longer matches the books', () => {
    renderCell({
      report: {
        id: 'report-feb',
        period: '2026-02',
        kind: 'PP55_OMZET',
        status: 'FINALIZED',
        taxDue: 1_000_000,
        isOutOfDate: true,
      },
    });

    expect(screen.getByText('Tidak sesuai')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/taxes/reports/report-feb');
  });
});
