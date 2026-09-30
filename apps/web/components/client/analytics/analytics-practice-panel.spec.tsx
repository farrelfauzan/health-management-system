import type { AnalyticsPracticeData } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const getPracticeMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/doctor/analytics',
}));
vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsPracticeControllerGetMyPracticeV1: getPracticeMock,
  getAnalyticsPracticeControllerGetMyPracticeV1QueryKey: (params: unknown) => [
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

const { AnalyticsPracticePanel } = await import('./analytics-practice-panel');

function buildPractice(): AnalyticsPracticeData {
  return {
    totals: {
      finishedEncounters: 286,
      medianConsultMinutes: 12,
      completedAppointments: 219,
      noShowAppointments: 19,
      noShowRatePercent: 8,
      sessionCapacity: 280,
      bookedAppointments: 241,
      sessionUtilisationPercent: 86,
    },
    series: [
      { bucket: '2026-09-01', finishedEncounters: 11 },
      { bucket: '2026-09-02', finishedEncounters: 9 },
    ],
    breakdowns: {
      topDiagnoses: [
        { code: 'J06.9', name: 'ISPA akut, tidak spesifik', count: 51 },
        { code: 'I10', name: 'Hipertensi esensial', count: 29 },
      ],
      codedEncounters: 270,
    },
  };
}

const META = {
  from: '2026-09-01',
  to: '2026-09-30',
  timezone: 'Asia/Jakarta',
  granularity: 'day',
  generatedAt: '2026-09-30T07:32:00.000Z',
};

function renderPanel(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale="id"
        timeZone="Asia/Jakarta"
        messages={{ ...idAuthShellMessages, ...idSharedMessages, ...idAnalyticsMessages }}
      >
        <AnalyticsPracticePanel
          filter={parseAnalyticsFilterParams({ compare: 'false' }, '2026-09-30')}
          today="2026-09-30"
          breadcrumbRoot={{ label: 'Hari ini', href: '/doctor/dashboard' }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AnalyticsPracticePanel', () => {
  beforeEach(() => {
    getPracticeMock.mockReset();
  });

  it('shows the clinician their own figures, and says the page is theirs alone', async () => {
    getPracticeMock.mockResolvedValue({ status: 200, data: { data: buildPractice(), meta: META } });

    renderPanel();

    expect(await screen.findByText('286')).toBeInTheDocument();
    expect(screen.getByText('12 mnt')).toBeInTheDocument();
    expect(screen.getByText('19 dari 238 janji temu')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByText('ISPA akut, tidak spesifik')).toBeInTheDocument();
    expect(
      screen.getByText('Halaman ini hanya menampilkan pemeriksaan dan jadwal Anda sendiri.'),
    ).toBeInTheDocument();
  });

  it('offers no poli, clinician or payer filter, and sends none', async () => {
    getPracticeMock.mockResolvedValue({ status: 200, data: { data: buildPractice(), meta: META } });

    renderPanel();

    await screen.findByText('286');
    expect(screen.queryByText('Semua poli')).not.toBeInTheDocument();
    expect(screen.queryByText('Semua dokter')).not.toBeInTheDocument();
    expect(getPracticeMock).toHaveBeenCalledWith(
      { from: '2026-09-01', to: '2026-09-30', compare: 'false' },
      expect.anything(),
    );
  });

  it('explains when the account has no clinician profile', async () => {
    getPracticeMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { error: { code: 'ANALYTICS_NO_CLINICIAN_PROFILE', message: 'x' } },
      },
    });

    renderPanel();

    expect(
      await screen.findByText(/belum terhubung dengan profil dokter atau bidan/),
    ).toBeInTheDocument();
  });
});
