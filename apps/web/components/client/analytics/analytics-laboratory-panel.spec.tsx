import type { AnalyticsLaboratoryData } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const getLaboratoryMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin/analytics/laboratory',
}));
vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsLaboratoryControllerGetLaboratoryV1: getLaboratoryMock,
  getAnalyticsLaboratoryControllerGetLaboratoryV1QueryKey: (params: unknown) => [
    'laboratory',
    params,
  ],
}));
vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({ specialties: [] }),
}));
vi.mock('#lib/doctors/use-doctors-list', () => ({
  useDoctorsList: () => ({ doctors: [] }),
}));

const { AnalyticsLaboratoryPanel } = await import('./analytics-laboratory-panel');

function buildLaboratory(): AnalyticsLaboratoryData {
  return {
    totals: {
      orders: 486,
      released: 452,
      inProgress: 18,
      sentOut: 0,
      cancelled: 16,
      medianTurnaroundMinutes: 52,
      p90TurnaroundMinutes: 130,
      recollectedOrders: 11,
      recollectionRatePercent: 2.3,
      cancellationRatePercent: 3.3,
    },
    series: [],
    breakdowns: {
      sources: [
        { source: 'ENCOUNTER', orders: 371 },
        { source: 'WALK_IN', orders: 88 },
        { source: 'EXTERNAL_REFERRAL', orders: 27 },
      ],
      tests: [
        {
          labTestId: 'cbc',
          code: 'CBC',
          name: 'Darah lengkap',
          orders: 168,
          releasedOrders: 160,
          medianTurnaroundMinutes: 45,
          p90TurnaroundMinutes: 80,
        },
        {
          labTestId: 'hba1c',
          code: 'HBA1C',
          name: 'HbA1c',
          orders: 18,
          releasedOrders: 17,
          medianTurnaroundMinutes: 180,
          p90TurnaroundMinutes: 360,
        },
        {
          labTestId: 'widal',
          code: 'WIDAL',
          name: 'Widal',
          orders: 2,
          releasedOrders: 0,
          medianTurnaroundMinutes: null,
          p90TurnaroundMinutes: null,
        },
      ],
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
        <AnalyticsLaboratoryPanel
          filter={parseAnalyticsFilterParams({ compare: 'false' }, '2026-09-30')}
          today="2026-09-30"
          breadcrumbRoot={{ label: 'Dasbor', href: '/admin/dashboard' }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AnalyticsLaboratoryPanel', () => {
  beforeEach(() => {
    getLaboratoryMock.mockReset();
    getLaboratoryMock.mockResolvedValue({
      status: 200,
      data: {
        data: buildLaboratory(),
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

  it('shows the headline as the Laboratorium artboard does, turnaround in hours past sixty minutes', async () => {
    renderPanel();

    expect(await screen.findByText('486')).toBeInTheDocument();
    expect(screen.getByText('52 mnt')).toBeInTheDocument();
    expect(screen.getByText('2 j 10 mnt')).toBeInTheDocument();
    expect(screen.getByText('2,3%')).toBeInTheDocument();
    expect(screen.getByText('Batal 3,3%')).toBeInTheDocument();
  });

  it('gives each test its median and p90, and says when nothing is released yet', async () => {
    renderPanel();

    const cbc = (await screen.findByText('Darah lengkap')).closest('tr') as HTMLElement;
    expect(within(cbc).getByText('45 mnt')).toBeInTheDocument();
    expect(within(cbc).getByText('1 j 20 mnt')).toBeInTheDocument();
    const hba1c = screen.getByText('HbA1c').closest('tr') as HTMLElement;
    expect(within(hba1c).getByText('3 j')).toBeInTheDocument();
    expect(within(hba1c).getByText('6 j')).toBeInTheDocument();
    const widal = screen.getByText('Widal').closest('tr') as HTMLElement;
    expect(within(widal).getByText('Belum dirilis')).toBeInTheDocument();
  });

  it('counts orders by status and by source, with no sent-out row when none were', async () => {
    renderPanel();

    expect(await screen.findByText('Dirilis')).toBeInTheDocument();
    expect(screen.getByText('452')).toBeInTheDocument();
    expect(screen.queryByText('Dikirim ke lab luar')).not.toBeInTheDocument();
    expect(screen.getByText('Datang langsung')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
  });
});
