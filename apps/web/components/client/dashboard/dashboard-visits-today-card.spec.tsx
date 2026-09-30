import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

const getVisitsTodayMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsOperationsControllerGetVisitsTodayV1: getVisitsTodayMock,
  getAnalyticsOperationsControllerGetVisitsTodayV1QueryKey: () => ['visits-today'],
}));

const { DashboardVisitsTodayCard } = await import('./dashboard-visits-today-card');

function renderCard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider
      locale="id"
      timeZone="Asia/Jakarta"
      messages={{ ...getDashboardAiMessages('id'), ...idAnalyticsMessages }}
    >
      <QueryClientProvider client={queryClient}>
        <DashboardVisitsTodayCard />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function mockVisits(visits: number, comparisonVisits: number): void {
  getVisitsTodayMock.mockResolvedValue({
    status: 200,
    data: {
      data: {
        date: '2026-09-29',
        comparisonDate: '2026-09-22',
        asOf: '2026-09-29T03:00:00.000Z',
        visits,
        comparisonVisits,
        changePercent: comparisonVisits === 0 ? null : 10.5,
      },
    },
  });
}

describe('DashboardVisitsTodayCard', () => {
  beforeEach(() => {
    getVisitsTodayMock.mockReset();
  });

  it('given 42 visits by 10:00 today and 38 by 10:00 last Tuesday, then it shows 42 and +11%', async () => {
    mockVisits(42, 38);

    renderCard();

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('+11%')).toBeInTheDocument();
    expect(screen.getByText('vs 38 Selasa lalu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lihat analitik/ })).toHaveAttribute(
      'href',
      '/admin/analytics/operations?preset=today',
    );
  });

  it('says so instead of a percentage when last week had no visit by this time', async () => {
    mockVisits(5, 0);

    renderCard();

    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(screen.getByText('Belum ada kunjungan Selasa lalu sampai jam ini')).toBeInTheDocument();
  });
});
