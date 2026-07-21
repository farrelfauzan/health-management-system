import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardStatCards } from './dashboard-stat-cards';
import { appointmentManagementControllerListAppointmentsV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { doctorManagementControllerListDoctorsV1 } from '#lib/api/generated/doctor-management/doctor-management';
import { prescriptionControllerListPrescriptionsV1 } from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import { registrationFlowControllerListRegistrationsV1 } from '#lib/api/generated/registration-flow/registration-flow';

vi.mock('#lib/api/generated/registration-flow/registration-flow', () => ({
  registrationFlowControllerListRegistrationsV1: vi.fn(),
  getRegistrationFlowControllerListRegistrationsV1QueryKey: (params?: unknown) => [
    'registrations',
    params,
  ],
}));

vi.mock('#lib/api/generated/appointment-management/appointment-management', () => ({
  appointmentManagementControllerListAppointmentsV1: vi.fn(),
  getAppointmentManagementControllerListAppointmentsV1QueryKey: (params?: unknown) => [
    'appointments',
    params,
  ],
}));

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorManagementControllerListDoctorsV1: vi.fn(),
  getDoctorManagementControllerListDoctorsV1QueryKey: (params?: unknown) => ['doctors', params],
}));

vi.mock('#lib/api/generated/pharmacy-flow/pharmacy-flow', () => ({
  prescriptionControllerListPrescriptionsV1: vi.fn(),
  getPrescriptionControllerListPrescriptionsV1QueryKey: (params?: unknown) => [
    'prescriptions',
    params,
  ],
}));

const registrationsRequestMock = vi.mocked(registrationFlowControllerListRegistrationsV1);
const appointmentsRequestMock = vi.mocked(appointmentManagementControllerListAppointmentsV1);
const doctorsRequestMock = vi.mocked(doctorManagementControllerListDoctorsV1);
const prescriptionsRequestMock = vi.mocked(prescriptionControllerListPrescriptionsV1);

type ListEnvelope = {
  status: number;
  headers: Record<string, unknown>;
  data: {
    data: never[];
    meta: { page: number; limit: number; total: number };
  };
};

function buildListEnvelope(total: number, items: unknown[] = []): ListEnvelope {
  return {
    status: 200,
    headers: {},
    data: {
      data: items as never[],
      meta: { page: 1, limit: 1, total },
    },
  };
}

function renderDashboardStatCards(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <DashboardStatCards />
    </QueryClientProvider>,
  );
}

describe('DashboardStatCards', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a skeleton per stat while the queries are pending', () => {
    const pendingForever = new Promise<never>(() => undefined);
    registrationsRequestMock.mockReturnValue(pendingForever);
    appointmentsRequestMock.mockReturnValue(pendingForever);
    doctorsRequestMock.mockReturnValue(pendingForever);
    prescriptionsRequestMock.mockReturnValue(pendingForever);

    renderDashboardStatCards();

    expect(screen.getByTestId('stat-skeleton-today-patients')).toBeInTheDocument();
    expect(screen.getByTestId('stat-skeleton-appointments')).toBeInTheDocument();
    expect(screen.getByTestId('stat-skeleton-doctors-on-duty')).toBeInTheDocument();
    expect(screen.getByTestId('stat-skeleton-pending-rx')).toBeInTheDocument();
  });

  it('renders backend totals and the computed upcoming-in-the-next-hour helper', async () => {
    const soonAppointment = {
      id: 'appointment-1',
      scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      status: 'CONFIRMED',
    };
    registrationsRequestMock.mockResolvedValue(buildListEnvelope(24));
    appointmentsRequestMock.mockResolvedValue(buildListEnvelope(12, [soonAppointment]));
    doctorsRequestMock.mockResolvedValue(buildListEnvelope(8));
    prescriptionsRequestMock.mockResolvedValue(buildListEnvelope(5));

    renderDashboardStatCards();

    expect(await screen.findByText('24')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('1 upcoming in the next hour')).toBeInTheDocument();
    expect(screen.getByText('Awaiting pharmacist verification')).toBeInTheDocument();
  });

  it('renders a fallback value when a stat query fails', async () => {
    registrationsRequestMock.mockResolvedValue(buildListEnvelope(24));
    appointmentsRequestMock.mockResolvedValue(buildListEnvelope(12));
    doctorsRequestMock.mockResolvedValue(buildListEnvelope(8));
    prescriptionsRequestMock.mockRejectedValue(new Error('network down'));

    renderDashboardStatCards();

    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getByText('Unable to load')).toBeInTheDocument();
  });
});
