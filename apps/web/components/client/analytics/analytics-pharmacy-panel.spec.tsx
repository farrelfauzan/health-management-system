import type { AnalyticsPharmacyData } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const getPharmacyMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin/analytics/pharmacy',
}));
vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsPharmacyControllerGetPharmacyV1: getPharmacyMock,
  getAnalyticsPharmacyControllerGetPharmacyV1QueryKey: (params: unknown) => ['pharmacy', params],
}));
vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({ specialties: [] }),
}));
vi.mock('#lib/doctors/use-doctors-list', () => ({
  useDoctorsList: () => ({ doctors: [] }),
}));

const { AnalyticsPharmacyPanel } = await import('./analytics-pharmacy-panel');

function buildPharmacy(): AnalyticsPharmacyData {
  return {
    totals: {
      prescriptionsIssued: 874,
      fullyDispensed: 812,
      partiallyDispensed: 21,
      cancelled: 12,
      awaitingDispense: 29,
      filledElsewhere: 0,
      fullyDispensedPercent: 92.9,
      medianDispenseMinutes: 14,
      medicationRevenue: 71_400_000,
    },
    series: [],
    breakdowns: {
      topMedications: [
        {
          medicationId: 'pct',
          code: 'PCT500',
          name: 'Paracetamol',
          strength: '500 mg',
          unit: 'TABLET',
          quantity: 3_420,
          dispenses: 402,
        },
      ],
      stock: {
        asOfDate: '2026-09-30',
        reorderCount: 9,
        reorder: [
          {
            medicationId: 'amx',
            code: 'AMX500',
            name: 'Amoksisilin',
            strength: '500 mg',
            unit: 'KAPSUL',
            stock: 40,
            reorderLevel: 50,
            averageDailyDispensed: 33,
            daysOfCover: 1.2,
          },
          {
            medicationId: 'salep',
            code: 'SLP',
            name: 'Salep kulit',
            strength: null,
            unit: 'TUBE',
            stock: 2,
            reorderLevel: 10,
            averageDailyDispensed: 0,
            daysOfCover: null,
          },
        ],
        expiring: [
          { window: 'EXPIRED', batches: 0, units: 0, medications: 0 },
          { window: 'WITHIN_30_DAYS', batches: 3, units: 240, medications: 3 },
          { window: 'WITHIN_60_DAYS', batches: 5, units: 410, medications: 4 },
          { window: 'WITHIN_90_DAYS', batches: 8, units: 700, medications: 6 },
        ],
      },
    },
  };
}

function renderPanel(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale="id"
        timeZone="Asia/Jakarta"
        messages={{ ...idAuthShellMessages, ...idSharedMessages, ...idAnalyticsMessages }}
      >
        <AnalyticsPharmacyPanel
          filter={parseAnalyticsFilterParams({ compare: 'false' }, '2026-09-30')}
          today="2026-09-30"
          breadcrumbRoot={{ label: 'Dasbor', href: '/admin/dashboard' }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AnalyticsPharmacyPanel', () => {
  beforeEach(() => {
    getPharmacyMock.mockReset();
    getPharmacyMock.mockResolvedValue({
      status: 200,
      data: {
        data: buildPharmacy(),
        meta: {
          from: '2026-09-01',
          to: '2026-09-30',
          timezone: 'Asia/Jakarta',
          granularity: 'day',
          generatedAt: '2026-09-30T07:32:00.000Z',
        },
      },
    });
  });

  it('shows the headline as the Farmasi artboard does', async () => {
    renderPanel();

    expect(await screen.findByText('92,9%')).toBeInTheDocument();
    expect(screen.getByText('812 resep · 21 sebagian · 12 batal')).toBeInTheDocument();
    expect(screen.getByText('14 mnt')).toBeInTheDocument();
    expect(screen.getByText('Rp71,4 jt')).toBeInTheDocument();
    expect(screen.getByText('3.420 tablet')).toBeInTheDocument();
  });

  it('lists amoxicillin under reorder and links to the same list on the stock page', async () => {
    renderPanel();

    const row = (await screen.findByText('Amoksisilin 500 mg')).closest('tr') as HTMLElement;
    expect(within(row).getByText('40')).toBeInTheDocument();
    expect(within(row).getByText('50')).toBeInTheDocument();
    expect(within(row).getByText('±1 hari')).toBeInTheDocument();
    expect(screen.getByTitle('Tidak ada penyerahan dalam 30 hari terakhir')).toHaveTextContent(
      'Tidak dipakai',
    );
    expect(screen.getByText(/9 obat di bawah batas pesan/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stok obat/ })).toHaveAttribute(
      'href',
      '/admin/pharmacy?tab=inventory&reorder=true',
    );
  });

  it('hides the expired row when nothing expired is left, and counts every prescription outcome', async () => {
    renderPanel();

    expect(await screen.findByText('≤ 30 hari')).toBeInTheDocument();
    expect(screen.getByText('3 batch')).toBeInTheDocument();
    expect(screen.queryByText('Sudah kedaluwarsa')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Pembagian resep/ })).toBeInTheDocument();
    expect(screen.getByText('Belum diserahkan')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
  });
});
