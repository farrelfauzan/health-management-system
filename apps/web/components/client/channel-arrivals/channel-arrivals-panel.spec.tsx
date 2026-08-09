import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idOperationsMessages from '../../../messages/id/operations.json';

const listArrivalsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/customer-service/customer-service', () => ({
  channelArrivalControllerListArrivalsV1: listArrivalsMock,
  channelArrivalControllerListMergeCandidatesV1: vi.fn(),
  channelArrivalControllerMergeDraftPatientV1: vi.fn(),
  getChannelArrivalControllerListArrivalsV1QueryKey: (params: unknown) => [
    'channel-arrivals',
    params,
  ],
  getChannelArrivalControllerListMergeCandidatesV1QueryKey: (params: unknown) => [
    'channel-merge-candidates',
    params,
  ],
}));

const { ChannelArrivalsPanel } = await import('./channel-arrivals-panel');

function buildArrival(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appointmentId: 'appointment-1',
    bookingReferenceCode: 'SJ-7QK4M2',
    channel: 'TELEGRAM',
    scheduledAt: '2026-08-09T01:00:00.000Z',
    appointmentStatus: 'SCHEDULED',
    doctorName: 'dr. Andi Pratama',
    specialty: 'Dokter Umum',
    patientId: 'patient-1',
    patientMrn: 'RM-000482',
    patientFullName: 'Rina Kusuma',
    patientPhoneNumber: '628123456789',
    patientIsDraft: true,
    missingFields: ['dateOfBirth', 'address', 'nik'],
    createdAt: '2026-08-08T14:22:00.000Z',
    ...overrides,
  };
}

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={idOperationsMessages}>
        <ChannelArrivalsPanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ChannelArrivalsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no chat booking is outstanding', async () => {
    listArrivalsMock.mockResolvedValue({ status: 200, data: { data: [] } });

    renderPanel();

    // A quiet day is the normal case on a pilot channel, and an empty card on
    // a busy registration screen is noise. The heading is present while the
    // first request is in flight and must be gone once it comes back empty.
    await vi.waitFor(() =>
      expect(screen.queryByText('Booking chat yang datang hari ini')).not.toBeInTheDocument(),
    );
  });

  it('names what the desk still has to ask a draft patient for', async () => {
    listArrivalsMock.mockResolvedValue({ status: 200, data: { data: [buildArrival()] } });

    renderPanel();

    expect(await screen.findByText('SJ-7QK4M2')).toBeInTheDocument();
    expect(screen.getByText('Belum lengkap')).toBeInTheDocument();
    expect(screen.getByText('Tanggal lahir')).toBeInTheDocument();
    expect(screen.getByText('Alamat')).toBeInTheDocument();
    expect(screen.getByText('NIK')).toBeInTheDocument();
  });

  it('lists a verified customer’s booking without offering a merge', async () => {
    listArrivalsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [buildArrival({ patientIsDraft: false, missingFields: ['bpjsNumber'] })],
      },
    });

    renderPanel();

    // The booking still appears — the desk wants to know it came from a phone
    // — but a record that is already someone's real one has nothing to merge.
    expect(await screen.findByText('Pasien terdaftar')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Gabungkan ke pasien terdaftar' }),
    ).not.toBeInTheDocument();
  });

  it('puts incomplete records above complete ones', async () => {
    listArrivalsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildArrival({
            appointmentId: 'appointment-complete',
            bookingReferenceCode: 'SJ-COMPLETE',
            patientIsDraft: false,
            missingFields: [],
            scheduledAt: '2026-08-09T00:30:00.000Z',
          }),
          buildArrival({
            appointmentId: 'appointment-draft',
            bookingReferenceCode: 'SJ-DRAFT',
            scheduledAt: '2026-08-09T03:00:00.000Z',
          }),
        ],
      },
    });

    renderPanel();
    await screen.findByText('SJ-DRAFT');

    // Ordering by work outstanding rather than by session time: the whole
    // point of the panel is the rows that need somebody.
    const referenceCells = screen.getAllByText(/^SJ-/).map((node) => node.textContent);
    expect(referenceCells).toEqual(['SJ-DRAFT', 'SJ-COMPLETE']);
  });
});
