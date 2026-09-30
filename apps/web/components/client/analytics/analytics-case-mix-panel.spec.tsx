import type { AnalyticsCaseMixData } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const getCaseMixMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin/analytics/case-mix',
}));
vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsCaseMixControllerGetCaseMixV1: getCaseMixMock,
  getAnalyticsCaseMixControllerGetCaseMixV1QueryKey: (params: unknown) => ['case-mix', params],
}));
vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({ specialties: [] }),
}));
vi.mock('#lib/doctors/use-doctors-list', () => ({
  useDoctorsList: () => ({ doctors: [] }),
}));

const { AnalyticsCaseMixPanel } = await import('./analytics-case-mix-panel');

const SUPPRESSED = { suppressed: true } as const;

function buildCaseMix(): AnalyticsCaseMixData {
  return {
    totals: {
      finishedEncounters: 300,
      codedEncounters: 270,
      uncodedEncounters: 30,
      codingCompletenessPercent: 90,
      distinctCodes: 5,
    },
    series: [],
    breakdowns: {
      topDiagnoses: [
        { kind: 'CODE', code: 'J06.9', name: 'ISPA akut', count: 84, sharePercent: 28 },
        { kind: 'CODE', code: 'K30', name: 'Dispepsia', count: SUPPRESSED, sharePercent: null },
        { kind: 'UNCODED', code: null, name: null, count: SUPPRESSED, sharePercent: null },
      ],
      groups: [
        { kind: 'CODE', group: 'J', count: 270, sharePercent: 90 },
        { kind: 'UNCODED', group: null, count: 30, sharePercent: 10 },
      ],
      codingByPoli: [
        {
          specialtyId: 'poli-1',
          specialtyName: 'Umum',
          finishedEncounters: 300,
          uncodedEncounters: 30,
          codingCompletenessPercent: 90,
        },
      ],
      topProcedures: [{ kind: 'CODE', code: '23.2', name: 'Restorasi gigi', count: SUPPRESSED }],
    },
  };
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
        <AnalyticsCaseMixPanel
          filter={parseAnalyticsFilterParams(query, '2026-09-28')}
          today="2026-09-28"
          breadcrumbRoot={{ label: 'Dasbor', href: '/admin/dashboard' }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AnalyticsCaseMixPanel', () => {
  beforeEach(() => {
    getCaseMixMock.mockReset();
    getCaseMixMock.mockResolvedValue({
      status: 200,
      data: {
        data: buildCaseMix(),
        meta: {
          from: '2026-09-01',
          to: '2026-09-30',
          timezone: 'Asia/Jakarta',
          granularity: 'day',
          generatedAt: '2026-09-28T07:32:00.000Z',
        },
      },
    });
  });

  it('shows a code with its count and share, and a withheld count as "<5" with no share', async () => {
    renderPanel({ compare: 'false' });

    expect(await screen.findByText('84 · 28%')).toBeInTheDocument();
    expect(
      screen.getAllByTitle('Angka di bawah 5 disembunyikan untuk melindungi privasi pasien').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/K30.*·/)).not.toBeInTheDocument();
  });

  it('names the ICD-10 group and the uncoded, and says why a procedure count is hidden', async () => {
    renderPanel({ compare: 'false' });

    expect(await screen.findByText('Saluran pernapasan')).toBeInTheDocument();
    expect(screen.getAllByText('Tanpa kode').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Angka di bawah 5 disembunyikan untuk melindungi privasi pasien', {
        selector: 'p',
      }),
    ).toBeInTheDocument();
  });

  it('links the completeness card to exactly the uncoded finished encounters of the period', async () => {
    renderPanel({ compare: 'false' });

    expect(
      await screen.findByRole('link', { name: /Pemeriksaan tanpa diagnosis/ }),
    ).toHaveAttribute(
      'href',
      '/admin/encounters?page=1&limit=10&status=FINISHED&from=2026-09-01&to=2026-09-30&uncoded=true',
    );
    expect(screen.getByText('270 dari 300')).toBeInTheDocument();
  });
});
