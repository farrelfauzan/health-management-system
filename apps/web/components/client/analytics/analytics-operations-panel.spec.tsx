import type { AnalyticsOperationsData } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idAnalyticsMessages from '../../../messages/id/analytics.json';
import idAuthShellMessages from '../../../messages/id/auth-shell.json';
import idSharedMessages from '../../../messages/id/shared.json';
import { parseAnalyticsFilterParams } from '#lib/analytics/parse-analytics-filter-params';

const getOperationsMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/admin/analytics/operations',
}));
vi.mock('#lib/api/generated/analytics/analytics', () => ({
  analyticsOperationsControllerGetOperationsV1: getOperationsMock,
  getAnalyticsOperationsControllerGetOperationsV1QueryKey: (params: unknown) => [
    'analytics-operations',
    params,
  ],
  // The Operasional page's small reporting card; left loading here.
  analyticsReportingHealthControllerGetReportingHealthV1: () => new Promise(() => undefined),
  getAnalyticsReportingHealthControllerGetReportingHealthV1QueryKey: (params: unknown) => [
    'analytics-reporting-health',
    params,
  ],
}));
vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({ specialties: [] }),
}));
vi.mock('#lib/doctors/use-doctors-list', () => ({
  useDoctorsList: () => ({ doctors: [] }),
}));

const { AnalyticsOperationsPanel } = await import('./analytics-operations-panel');

const TODAY = '2026-09-28';

function buildApiError(status: number, code: string): AxiosError {
  return new AxiosError('Request failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { code, message: 'This report took too long to prepare.' } },
  });
}

function buildOperations(): AnalyticsOperationsData {
  return {
    totals: {
      visits: 150,
      newPatients: 30,
      returningPatients: 120,
      walkIns: 110,
      appointments: 40,
      completedAppointments: 30,
      noShowAppointments: 10,
      noShowRatePercent: 25,
      medianWaitMinutes: 18,
      p90WaitMinutes: 41,
      excludedWaitIntervals: 0,
      medianConsultMinutes: 11,
      p90ConsultMinutes: 23,
      excludedConsultIntervals: 14,
      sessionUtilisationPercent: 82,
      inpatient: null,
    },
    series: [{ bucket: '2026-09-01', visits: 150, consultation: 150, labOnly: 0, admission: 0 }],
    breakdowns: {
      visitsByType: [{ type: 'CONSULTATION', visits: 150 }],
      visitsByPoli: [
        { specialtyId: null, specialtyName: 'Poli Umum', visits: 150, previousVisits: 120 },
      ],
      visitsByDoctor: [],
      appointmentOutcomes: [
        { status: 'COMPLETED', appointments: 30 },
        { status: 'NO_SHOW', appointments: 10 },
      ],
      bookingChannels: [
        { channel: 'WHATSAPP', bookings: 40, completed: 30, noShows: 10, noShowRatePercent: 25 },
      ],
      busiestHours: [{ weekday: 1, hour: 8, checkIns: 96 }],
      sessions: {
        cappedSessions: 20,
        capacity: 400,
        bookedAppointments: 328,
        movedSessions: 0,
        cancelledSessions: 0,
      },
      inpatientDispositions: null,
    },
    comparison: {
      from: '2026-08-01',
      to: '2026-08-31',
      totals: {
        visits: 120,
        newPatients: 20,
        returningPatients: 100,
        walkIns: 90,
        appointments: 30,
        completedAppointments: 25,
        noShowAppointments: 5,
        noShowRatePercent: 16.7,
        medianWaitMinutes: 15,
        p90WaitMinutes: 35,
        excludedWaitIntervals: 0,
        medianConsultMinutes: 12,
        p90ConsultMinutes: 22,
        excludedConsultIntervals: 0,
        sessionUtilisationPercent: 80,
        inpatient: null,
      },
      series: [],
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
        <AnalyticsOperationsPanel
          filter={parseAnalyticsFilterParams(query, TODAY)}
          today={TODAY}
          breadcrumbRoot={{ label: 'Dasbor', href: '/admin/dashboard' }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AnalyticsOperationsPanel', () => {
  beforeEach(() => {
    getOperationsMock.mockReset();
    replaceMock.mockReset();
  });

  it('shows the "too slow" state for the API timeout, in words and without the code', async () => {
    getOperationsMock.mockRejectedValue(buildApiError(503, 'ANALYTICS_QUERY_TIMEOUT'));

    renderPanel();

    expect(await screen.findByText('Perhitungan terlalu lama')).toBeInTheDocument();
    expect(screen.queryByText(/ANALYTICS_QUERY_TIMEOUT/)).not.toBeInTheDocument();
    expect(getOperationsMock).toHaveBeenCalledTimes(1);
  });

  it('offers three months from the "too slow" state and writes it to the URL', async () => {
    getOperationsMock.mockRejectedValue(buildApiError(503, 'ANALYTICS_QUERY_TIMEOUT'));
    renderPanel({ period: 'last-12-months' });

    await userEvent.click(await screen.findByRole('button', { name: 'Pilih 3 bulan' }));

    expect(replaceMock).toHaveBeenCalledWith('/admin/analytics/operations?period=last-3-months', {
      scroll: false,
    });
  });

  it('shows the general error state for any other failure', async () => {
    getOperationsMock.mockRejectedValue(buildApiError(500, 'INTERNAL_ERROR'));

    renderPanel();

    expect(await screen.findByText('Dasbor belum bisa dimuat')).toBeInTheDocument();
  });

  it('refuses a range longer than 24 months without asking the API', () => {
    renderPanel({ period: 'custom', from: '2024-01-01', to: '2026-09-30' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Rentang paling panjang 24 bulan. Perpendek tanggal mulai atau akhir.',
    );
    expect(getOperationsMock).not.toHaveBeenCalled();
  });

  it('shows the figures with their change against the comparison period', async () => {
    getOperationsMock.mockResolvedValue({
      status: 200,
      data: {
        data: buildOperations(),
        meta: {
          from: '2026-09-01',
          to: '2026-09-30',
          timezone: 'Asia/Jakarta',
          granularity: 'day',
          generatedAt: '2026-09-28T07:32:00.000Z',
        },
      },
    });

    renderPanel();

    expect(await screen.findByText('Data per 14.32 WIB')).toBeInTheDocument();
    // Visits 150 against 120 on the KPI tile, and Poli Umum's 150 against 120.
    expect(screen.getAllByText('+25%')).toHaveLength(2);
    expect(screen.getByText('vs 120')).toBeInTheDocument();
    expect(screen.getByText('Bandingkan dengan')).toBeInTheDocument();
    expect(getOperationsMock).toHaveBeenCalledWith(
      {
        from: '2026-09-01',
        to: '2026-09-30',
        compare: 'true',
        specialtyId: undefined,
        doctorId: undefined,
      },
      expect.anything(),
    );
  });

  it('shows the wait against last period, the busiest hour and session fill, and no inpatient card', async () => {
    getOperationsMock.mockResolvedValue({
      status: 200,
      data: {
        data: buildOperations(),
        meta: {
          from: '2026-09-01',
          to: '2026-09-30',
          timezone: 'Asia/Jakarta',
          granularity: 'day',
          generatedAt: '2026-09-28T07:32:00.000Z',
        },
      },
    });

    renderPanel();

    expect(await screen.findByText('18 mnt')).toBeInTheDocument();
    expect(screen.getByText('+3 mnt')).toBeInTheDocument();
    expect(screen.getByText('14 kunjungan > 8 jam dikecualikan')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Check-in per hari dan jam. Paling sibuk Senin pukul 08.00 dengan 96 check-in.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.queryByText('Rawat inap')).not.toBeInTheDocument();
  });

  it('writes a preset change into the URL', async () => {
    getOperationsMock.mockReturnValue(new Promise(() => undefined));
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Bulan lalu' }));

    expect(replaceMock).toHaveBeenCalledWith('/admin/analytics/operations?period=last-month', {
      scroll: false,
    });
  });
});
