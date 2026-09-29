import type { AnalyticsFinanceData } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const getFinanceMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin/analytics/finance',
}));
vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsFinanceControllerGetFinanceV1: getFinanceMock,
  getAnalyticsFinanceControllerGetFinanceV1QueryKey: (params: unknown) => [
    'analytics-finance',
    params,
  ],
}));
vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({ specialties: [] }),
}));
vi.mock('#lib/doctors/use-doctors-list', () => ({
  useDoctorsList: () => ({ doctors: [] }),
}));

const { AnalyticsFinancePanel } = await import('./analytics-finance-panel');

const TODAY = '2026-09-28';
const META = {
  from: '2026-09-01',
  to: '2026-09-30',
  timezone: 'Asia/Jakarta',
  granularity: 'day',
  generatedAt: '2026-09-28T07:32:00.000Z',
};

function buildFinance(overrides: Partial<AnalyticsFinanceData> = {}): AnalyticsFinanceData {
  return {
    totals: {
      revenue: 186_400_000,
      taxAmount: 2_100_000,
      invoices: 1_160,
      invoicedVisits: 1_147,
      revenuePerVisit: 162_500,
      unpaidInvoices: 41,
      unpaidAmount: 9_800_000,
      cashReceived: 180_000_000,
      payments: 1_119,
      voidedInvoices: 7,
      voidedAmount: 1_200_000,
    },
    series: [{ bucket: '2026-09-01', revenue: 6_200_000, cashReceived: 6_000_000 }],
    breakdowns: {
      paymentMethods: [
        { method: 'CASH', payments: 500, amount: 80_000_000 },
        { method: 'TRANSFER', payments: 100, amount: 30_000_000 },
        { method: 'QRIS', payments: 300, amount: 50_000_000 },
        { method: 'INSURANCE', payments: 50, amount: 20_000_000 },
      ],
      itemTypes: [
        { itemType: 'MEDICATION', lines: 2_000, amount: 71_400_000, taxAmount: 0 },
        { itemType: 'CONSULTATION', lines: 1_100, amount: 60_300_000, taxAmount: 2_100_000 },
      ],
      doctors: [
        {
          doctorId: 'doctor-1',
          doctorName: 'dr. Rina Kartika',
          specialtyName: 'Umum',
          invoices: 418,
          visits: 412,
          revenue: 61_200_000,
          revenuePerVisit: 148_544,
        },
        {
          doctorId: null,
          doctorName: null,
          specialtyName: null,
          invoices: 30,
          visits: 30,
          revenue: 2_400_000,
          revenuePerVisit: 80_000,
        },
      ],
      poli: [],
      payers: [
        { payerType: 'GENERAL', visits: 520, invoices: 510, revenue: 132_000_000 },
        { payerType: 'BPJS', visits: 310, invoices: 300, revenue: 22_000_000 },
        { payerType: 'INSURANCE', visits: 60, invoices: 60, revenue: 22_000_000 },
        { payerType: null, visits: 110, invoices: 100, revenue: 10_400_000 },
      ],
      outstanding: {
        invoices: 41,
        amount: 9_800_000,
        aging: [
          { bucket: '0-7', invoices: 26, amount: 5_900_000 },
          { bucket: '8-30', invoices: 11, amount: 3_100_000 },
          { bucket: 'over-30', invoices: 4, amount: 800_000 },
        ],
      },
    },
    ...overrides,
  };
}

function buildApiError(status: number, code: string): AxiosError {
  return new AxiosError('Request failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { code, message: 'This report took too long to prepare.' } },
  });
}

function renderPanel(query: Record<string, string> = {}): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale="id"
        timeZone="Asia/Jakarta"
        messages={{ ...idAuthShellMessages, ...idSharedMessages, ...idAnalyticsMessages }}
      >
        <AnalyticsFinancePanel
          filter={parseAnalyticsFilterParams(query, TODAY)}
          today={TODAY}
          breadcrumbRoot={{ label: 'Dasbor', href: '/admin/dashboard' }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function resolveWith(finance: AnalyticsFinanceData): void {
  getFinanceMock.mockResolvedValue({ status: 200, data: { data: finance, meta: META } });
}

describe('AnalyticsFinancePanel', () => {
  beforeEach(() => {
    getFinanceMock.mockReset();
  });

  it('shortens rupiah on the tiles and writes it in full in the tables', async () => {
    resolveWith(buildFinance());

    renderPanel({ compare: 'false' });

    expect(await screen.findByText('Rp186,4 jt')).toBeInTheDocument();
    expect(screen.getByText('Rp162.500')).toBeInTheDocument();
    expect(screen.getByText('Rp61.200.000')).toBeInTheDocument();
  });

  it('names the unattributed row "Tanpa dokter", never an internal value', async () => {
    resolveWith(buildFinance());

    renderPanel({ compare: 'false' });

    expect(await screen.findByText('Tanpa dokter')).toBeInTheDocument();
    expect(screen.queryByText(/UNATTRIBUTED|null/)).not.toBeInTheDocument();
  });

  it('given payer data missing for old visits, explains "Tidak tercatat" under the payer block', async () => {
    resolveWith(buildFinance());

    renderPanel({ compare: 'false' });

    expect(
      await screen.findByText(/ditampilkan sebagai “Tidak tercatat”, tidak ditebak/),
    ).toBeInTheDocument();
  });

  it('leaves the explanation out when every visit has a payer', async () => {
    const complete = buildFinance();
    complete.breakdowns.payers = complete.breakdowns.payers.map((row) =>
      row.payerType === null ? { ...row, visits: 0, invoices: 0, revenue: 0 } : row,
    );
    resolveWith(complete);

    renderPanel({ compare: 'false' });

    expect(await screen.findByText('Penjamin')).toBeInTheDocument();
    expect(screen.queryByText(/tidak ditebak/)).not.toBeInTheDocument();
  });

  it('notes the tax apart and flags invoices unpaid for over thirty days', async () => {
    resolveWith(buildFinance());

    renderPanel({ compare: 'false' });

    expect(
      await screen.findByText('Pajak terpungut Rp2,1 jt dicatat terpisah'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Daftar invoice/ })).toHaveAttribute(
      'href',
      '/admin/billing?page=1&limit=10&status=ISSUED',
    );
    expect(screen.getByText('> 30 hari')).toHaveClass('text-danger');
  });

  it('shows the "too slow" state for the API timeout', async () => {
    getFinanceMock.mockRejectedValue(buildApiError(503, 'ANALYTICS_QUERY_TIMEOUT'));

    renderPanel();

    expect(await screen.findByText('Perhitungan terlalu lama')).toBeInTheDocument();
  });

  it('says no invoice was found rather than drawing a page of zeros', async () => {
    const empty = buildFinance();
    empty.totals = { ...empty.totals, invoices: 0, payments: 0 };
    empty.breakdowns.outstanding = { invoices: 0, amount: 0, aging: [] };
    resolveWith(empty);

    renderPanel({ payer: 'BPJS' });

    expect(await screen.findByText('Belum ada invoice pada periode ini')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hapus filter' })).toBeInTheDocument();
  });

  it('asks the API for the filter in the URL, payer included', () => {
    getFinanceMock.mockReturnValue(new Promise(() => undefined));

    renderPanel({ payer: 'INSURANCE' });

    expect(getFinanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-09-01', to: '2026-09-30', payerType: 'INSURANCE' }),
      expect.anything(),
    );
  });
});
