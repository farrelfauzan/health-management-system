import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idOperationsMessages from '../../../messages/id/operations.json';

const listProspectivePatientsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/customer-service/customer-service', () => ({
  prospectivePatientControllerListProspectivePatientsV1: listProspectivePatientsMock,
  prospectivePatientControllerListMatchCandidatesV1: vi.fn(),
  prospectivePatientControllerLinkToExistingPatientV1: vi.fn(),
  prospectivePatientControllerConvertToNewPatientV1: vi.fn(),
  getProspectivePatientControllerListProspectivePatientsV1QueryKey: (params: unknown) => [
    'prospective-patients',
    params,
  ],
  getProspectivePatientControllerListMatchCandidatesV1QueryKey: (
    prospectivePatientId: string,
    params: unknown,
  ) => ['prospective-match-candidates', prospectivePatientId, params],
}));

const { ProspectivePatientsPanel } = await import('./prospective-patients-panel');

const DESK_RULES: AppRule[] = [
  { action: 'read', subject: 'Patient' },
  { action: 'create', subject: 'Patient' },
  { action: 'update', subject: 'Patient' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'Patient' }];

function buildProspectivePatient(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'prospective-1',
    fullName: 'Siti Rahayu',
    phoneNumber: '6281234567890',
    channel: 'TELEGRAM',
    status: 'AWAITING_ARRIVAL',
    patientId: null,
    patientMrn: null,
    openAppointments: 1,
    upcomingAppointment: {
      id: 'appointment-1',
      scheduledAt: '2026-09-12T02:00:00.000Z',
      doctorName: 'dr. Andi Pratama',
    },
    expiresAt: '2026-12-08T14:22:00.000Z',
    createdAt: '2026-09-09T14:22:00.000Z',
    ...overrides,
  };
}

function mockPage(items: Array<Record<string, unknown>>, total = items.length): void {
  listProspectivePatientsMock.mockResolvedValue({
    status: 200,
    data: { data: items, meta: { page: 1, limit: 20, total } },
  });
}

function renderPanel(rules: AppRule[] = DESK_RULES): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={idOperationsMessages} timeZone="Asia/Jakarta">
        <AbilityProvider ability={buildAppAbility(rules)}>
          <ProspectivePatientsPanel />
        </AbilityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ProspectivePatientsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on the people still waiting, oldest enquiry first', async () => {
    mockPage([buildProspectivePatient()]);

    renderPanel();
    await screen.findByText('Siti Rahayu');

    // The desk's default (`P19-T08`): anything else and the tab opens on rows
    // that have already been dealt with.
    expect(listProspectivePatientsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'AWAITING_ARRIVAL',
        sort: 'createdAt',
        order: 'asc',
        page: 1,
      }),
      expect.anything(),
    );
  });

  it('shows the phone number, the channel and the booking the person has ahead', async () => {
    mockPage([buildProspectivePatient()]);

    renderPanel();

    expect(await screen.findByText('Siti Rahayu')).toBeInTheDocument();
    // Stored normalised, read back the way a person says it — the shared
    // `formatPhoneNumber` groups a mobile number 3-4-4 (`P19-T09`).
    expect(screen.getByText('+62 812-3456-7890')).toBeInTheDocument();
    expect(screen.getByText('Telegram')).toBeInTheDocument();
    expect(screen.getByText('dr. Andi Pratama')).toBeInTheDocument();
    // Not `getByText`: "Menunggu" is also the status select's current value.
    // The badge is the one carrying a tone, and waiting is a warning tone.
    expect(screen.getByText('Menunggu', { selector: '[data-tone]' })).toHaveAttribute(
      'data-tone',
      'warning',
    );
  });

  it('says so plainly when nobody has booked yet', async () => {
    mockPage([]);

    renderPanel();

    expect(await screen.findByText('Tidak ada yang menunggu')).toBeInTheDocument();
  });

  it('offers both resolutions on a waiting row', async () => {
    mockPage([buildProspectivePatient()]);

    renderPanel();

    expect(
      await screen.findByRole('button', { name: 'Daftarkan sebagai pasien' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tautkan ke pasien terdaftar' }),
    ).toBeInTheDocument();
  });

  it('hides the resolutions from somebody who may only read patients', async () => {
    mockPage([buildProspectivePatient()]);

    renderPanel(READ_ONLY_RULES);
    await screen.findByText('Siti Rahayu');

    // Visibility only — the endpoints are still guarded — but a button that
    // always fails is worse than no button.
    expect(
      screen.queryByRole('button', { name: 'Daftarkan sebagai pasien' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tautkan ke pasien terdaftar' }),
    ).not.toBeInTheDocument();
  });

  it('links a resolved row to the record it became instead of offering to resolve it again', async () => {
    mockPage([
      buildProspectivePatient({
        status: 'CONVERTED',
        patientId: 'patient-9',
        patientMrn: 'RM-000119',
        upcomingAppointment: null,
      }),
    ]);

    renderPanel();

    const openRecord = await screen.findByRole('link', { name: 'Buka rekam medis' });
    expect(openRecord).toHaveAttribute('href', '/admin/patients/patient-9');
    expect(screen.getByText('RM-000119')).toBeInTheDocument();
    expect(screen.getByText('Tidak ada booking mendatang')).toBeInTheDocument();
  });

  it('asks the API again when the desk narrows to one messenger', async () => {
    mockPage([buildProspectivePatient()]);

    renderPanel();
    await screen.findByText('Siti Rahayu');
    await userEvent.click(screen.getByLabelText('Kanal'));
    await userEvent.click(await screen.findByRole('option', { name: 'WhatsApp' }));

    await vi.waitFor(() =>
      expect(listProspectivePatientsMock).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'WHATSAPP', status: 'AWAITING_ARRIVAL' }),
        expect.anything(),
      ),
    );
  });
});
