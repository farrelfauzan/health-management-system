import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idOperationsMessages from '../../../messages/id/operations.json';

const listMatchCandidatesMock = vi.hoisted(() => vi.fn());
const linkMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/customer-service/customer-service', () => ({
  channelArrivalControllerListArrivalsV1: vi.fn(),
  getChannelArrivalControllerListArrivalsV1QueryKey: () => ['channel-arrivals'],
  prospectivePatientControllerListMatchCandidatesV1: listMatchCandidatesMock,
  prospectivePatientControllerLinkToExistingPatientV1: linkMock,
  prospectivePatientControllerConvertToNewPatientV1: vi.fn(),
  getProspectivePatientControllerListMatchCandidatesV1QueryKey: (
    prospectivePatientId: string,
    params: unknown,
  ) => ['prospective-match-candidates', prospectivePatientId, params],
  getProspectivePatientControllerListProspectivePatientsV1QueryKey: () => ['prospective-patients'],
}));

const { ProspectiveArrivalDrawer } = await import('./prospective-arrival-drawer');

const arrival = {
  appointmentId: 'appointment-2',
  bookingReferenceCode: 'SJ-7QK4M2',
  channel: 'TELEGRAM',
  scheduledAt: '2026-08-09T01:00:00.000Z',
  appointmentStatus: 'SCHEDULED',
  doctorName: 'dr. Andi Pratama',
  specialty: 'Dokter Umum',
  subjectKind: 'PROSPECTIVE_PATIENT',
  patientId: null,
  patientMrn: null,
  prospectivePatientId: 'prospective-1',
  patientFullName: 'Siti Rahayu',
  patientPhoneNumber: '628123456789',
  patientIsDraft: true,
  missingFields: ['dateOfBirth', 'sex', 'address', 'nik', 'bpjsNumber'],
  createdAt: '2026-08-08T14:22:00.000Z',
} as unknown as Parameters<typeof ProspectiveArrivalDrawer>[0]['arrival'];

function buildCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'patient-1',
    mrn: 'RM-000119',
    fullName: 'Siti Rahayu Wulandari',
    phoneNumber: '628123456789',
    dateOfBirth: '1991-03-14',
    nikMasked: '••••••••3271',
    score: 71,
    reasons: ['PHONE_EXACT', 'NAME_SIMILAR'],
    ...overrides,
  };
}

function renderDrawer(): { onResolved: ReturnType<typeof vi.fn> } {
  const onResolved = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={idOperationsMessages}>
        <ProspectiveArrivalDrawer
          open
          onOpenChange={vi.fn()}
          arrival={arrival}
          prospectivePatientId="prospective-1"
          onResolved={onResolved}
          onFailed={vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onResolved };
}

describe('ProspectiveArrivalDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches the registry on open without anything being typed', async () => {
    listMatchCandidatesMock.mockResolvedValue({ status: 200, data: { data: [buildCandidate()] } });

    renderDrawer();

    // The API seeds the search from the booking's own name and number. A search
    // the clerk has to think of is a search that gets skipped when the queue is
    // six deep — and skipping it is what creates a second record for someone
    // the clinic already has.
    expect(await screen.findByText('Siti Rahayu Wulandari')).toBeInTheDocument();
    expect(listMatchCandidatesMock).toHaveBeenCalledWith(
      'prospective-1',
      { limit: 8 },
      expect.anything(),
    );
  });

  it('keeps the register button shut until a search has come back', async () => {
    let resolveSearch: ((value: unknown) => void) | undefined;
    listMatchCandidatesMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );

    renderDrawer();

    expect(screen.getByRole('button', { name: 'Daftarkan sebagai pasien baru' })).toBeDisabled();
    resolveSearch?.({ status: 200, data: { data: [] } });
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Daftarkan sebagai pasien baru' }),
      ).toBeEnabled(),
    );
  });

  it('sends only a NIK that could actually match', async () => {
    listMatchCandidatesMock.mockResolvedValue({ status: 200, data: { data: [] } });

    renderDrawer();
    await screen.findByText('Tidak ada data pasien yang cocok.');
    await userEvent.type(screen.getByLabelText('NIK dari kartu identitas'), '3271');

    // A half-typed NIK is not a NIK. Sending it would replace a useful default
    // search with a request the API rejects, right as the clerk is typing.
    expect(listMatchCandidatesMock).not.toHaveBeenCalledWith(
      'prospective-1',
      expect.objectContaining({ nik: expect.anything() }),
      expect.anything(),
    );
  });

  it('links a candidate and reports that no MRN was spent', async () => {
    listMatchCandidatesMock.mockResolvedValue({ status: 200, data: { data: [buildCandidate()] } });
    linkMock.mockResolvedValue({ status: 200, data: { data: {} } });

    const { onResolved } = renderDrawer();
    await screen.findByText('Siti Rahayu Wulandari');
    await userEvent.click(screen.getByRole('button', { name: 'Tautkan' }));

    await vi.waitFor(() =>
      expect(linkMock).toHaveBeenCalledWith('prospective-1', { patientId: 'patient-1' }),
    );
    await vi.waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        'Pemesanan kini menunjuk ke data pasien yang sudah ada. Tidak ada nomor rekam medis baru.',
      ),
    );
  });

  it('shows why each candidate was offered', async () => {
    listMatchCandidatesMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildCandidate({ id: 'nik-match', reasons: ['NIK_EXACT'] }),
          buildCandidate({ id: 'search-only', fullName: 'Budi Santoso', reasons: [] }),
        ],
      },
    });

    renderDrawer();

    // The reason is what the clerk acts on: an exact NIK is evidence, and a row
    // that only matched what they typed must not read as a confirmed match.
    expect(await screen.findByText('NIK sama')).toBeInTheDocument();
    expect(screen.getByText('Hanya cocok dengan pencarian')).toBeInTheDocument();
  });
});
