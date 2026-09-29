import type { AnalyticsReportingHealthData } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const getReportingHealthMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin/analytics/reporting',
}));
vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsReportingHealthControllerGetReportingHealthV1: getReportingHealthMock,
  getAnalyticsReportingHealthControllerGetReportingHealthV1QueryKey: (params: unknown) => [
    'analytics-reporting-health',
    params,
  ],
}));

const { AnalyticsReportingHealthPanel } = await import('./analytics-reporting-health-panel');

const TODAY = '2026-09-28';

function respondWith(data: AnalyticsReportingHealthData): void {
  getReportingHealthMock.mockResolvedValue({
    status: 200,
    data: {
      data,
      meta: {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'Asia/Jakarta',
        granularity: 'day',
        generatedAt: '2026-09-28T07:32:00.000Z',
      },
    },
  });
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
        <AnalyticsReportingHealthPanel
          filter={parseAnalyticsFilterParams({}, TODAY)}
          today={TODAY}
          breadcrumbRoot={{ label: 'Dasbor', href: '/admin/dashboard' }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AnalyticsReportingHealthPanel', () => {
  beforeEach(() => {
    getReportingHealthMock.mockReset();
  });

  it('given 3 failed encounter submissions, shows 3 and links to the list filtered to FAILED', async () => {
    respondWith({
      satusehat: [
        {
          kind: 'ENCOUNTER',
          submitted: 1058,
          pending: 12,
          failed: 3,
          oldestPendingAt: '2026-09-28T05:18:00.000Z',
        },
      ],
      bpjs: null,
      readiness: { encountersWithoutPrimaryDiagnosis: 0, encountersWithUnlinkedClinician: 0 },
    });

    renderPanel();

    const fixLink = await screen.findByRole('link', {
      name: 'Perbaiki 3 kiriman Kunjungan yang gagal',
    });
    expect(fixLink).toHaveAttribute(
      'href',
      '/admin/integrations?tab=monitor&provider=satusehat&status=FAILED&kind=ENCOUNTER',
    );
    expect(screen.getByText('Tertua 2 j 14 mnt')).toBeInTheDocument();
  });

  it('given BPJS keys off, leaves the BPJS block and its tile out', async () => {
    respondWith({
      satusehat: [],
      bpjs: null,
      readiness: { encountersWithoutPrimaryDiagnosis: 0, encountersWithUnlinkedClinician: 0 },
    });

    renderPanel();

    expect(await screen.findByText('SATUSEHAT')).toBeInTheDocument();
    expect(screen.queryByText('BPJS PCare dan Antrean')).not.toBeInTheDocument();
    expect(screen.queryByText('Gagal ke BPJS')).not.toBeInTheDocument();
  });

  it('given BPJS on, lists each type with a fix link only where something failed', async () => {
    respondWith({
      satusehat: [],
      bpjs: [
        { type: 'OBAT', submitted: 388, pending: 0, failed: 2 },
        { type: 'KUNJUNGAN', submitted: 402, pending: 0, failed: 0 },
      ],
      readiness: { encountersWithoutPrimaryDiagnosis: 72, encountersWithUnlinkedClinician: 1 },
    });

    renderPanel();

    expect(await screen.findByText('BPJS PCare dan Antrean')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Perbaiki 2 kiriman Obat yang gagal' }),
    ).toHaveAttribute(
      'href',
      '/admin/integrations?tab=monitor&provider=bpjs&status=FAILED&type=OBAT',
    );
    expect(screen.getAllByRole('link', { name: /^Perbaiki/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Lihat' })).toHaveAttribute(
      'href',
      '/admin/doctors?missingNik=true',
    );
  });

  it('asks the API for the period only', async () => {
    respondWith({
      satusehat: [],
      bpjs: null,
      readiness: { encountersWithoutPrimaryDiagnosis: 0, encountersWithUnlinkedClinician: 0 },
    });

    renderPanel();

    await screen.findByText('SATUSEHAT');
    expect(getReportingHealthMock).toHaveBeenCalledWith(
      { from: '2026-09-01', to: '2026-09-30' },
      expect.anything(),
    );
    expect(screen.queryByText('Poli')).not.toBeInTheDocument();
  });
});
