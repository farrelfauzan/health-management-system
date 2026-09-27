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

const { TaxReportMonthsTableRow } = await import('./tax-report-months-table-row');

function renderRow(props: Partial<Parameters<typeof TaxReportMonthsTableRow>[0]> = {}): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient()}>
        <table>
          <tbody>
            <TaxReportMonthsTableRow
              period="2026-02"
              kind="PPN_OUTPUT"
              canWrite
              isFuture={false}
              {...props}
            />
          </tbody>
        </table>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaxReportMonthsTableRow', () => {
  beforeEach(() => {
    createReportMock.mockReset();
    pushMock.mockReset();
  });

  it('drafts an empty month from its row and opens it', async () => {
    createReportMock.mockResolvedValue({ status: 201, data: { data: { id: 'report-feb' } } });
    renderRow();

    fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/taxes/reports/report-feb'));
    expect(createReportMock).toHaveBeenCalledWith({ period: '2026-02', kind: 'PPN_OUTPUT' });
  });

  it('shows a month that has not started as not drafted, with no draft button', () => {
    renderRow({ isFuture: true });

    expect(screen.getByText('Belum dibuat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buat draft' })).not.toBeInTheDocument();
  });

  it('shows a drafted month with its amount, status and a link to the report', () => {
    renderRow({
      report: {
        id: 'report-feb',
        period: '2026-02',
        kind: 'PPN_OUTPUT',
        status: 'FINALIZED',
        taxDue: 1_000_000,
        isOutOfDate: true,
      },
    });

    expect(screen.getByText('Tidak sesuai')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buka' })).toHaveAttribute(
      'href',
      '/admin/taxes/reports/report-feb',
    );
  });
});
