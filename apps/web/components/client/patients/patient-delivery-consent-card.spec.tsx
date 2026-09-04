import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PatientDeliveryConsentCard } from './patient-delivery-consent-card';
import {
  patientDeliveryConsentControllerListConsentsV1,
  patientDeliveryConsentControllerUpsertConsentV1,
} from '#lib/api/generated/patient-delivery-consent/patient-delivery-consent';
import messages from '../../../messages/id/clinical.json';

vi.mock('#lib/api/generated/patient-delivery-consent/patient-delivery-consent', () => ({
  patientDeliveryConsentControllerListConsentsV1: vi.fn(),
  getPatientDeliveryConsentControllerListConsentsV1QueryKey: (patientId: string) => [
    `/api/v1/patients/${patientId}/delivery-consents`,
  ],
  patientDeliveryConsentControllerUpsertConsentV1: vi.fn(),
}));

const canMock = vi.fn<(action: string, subject: string) => boolean>(() => true);

vi.mock('@hms/ui', async () => {
  const actual = await vi.importActual<typeof import('@hms/ui')>('@hms/ui');
  return { ...actual, useAbility: () => ({ can: canMock }) };
});

const listRequestMock = vi.mocked(patientDeliveryConsentControllerListConsentsV1);
const upsertRequestMock = vi.mocked(patientDeliveryConsentControllerUpsertConsentV1);

const GRANTED_WHATSAPP = {
  channel: 'WHATSAPP',
  consent: {
    channel: 'WHATSAPP',
    isGranted: true,
    noticeVersion: { id: 'notice-1', version: '1.0' },
    grantedAt: '2026-09-28T02:15:00.000Z',
    grantedBy: { id: 'user-1', email: 'kasir@klinik.example' },
    revokedAt: null,
    revokedReason: null,
  },
  isDeliveryAllowed: false,
  refusalReason: 'NUMBER_UNVERIFIED',
};

const OPTED_OUT_WHATSAPP = {
  channel: 'WHATSAPP',
  consent: {
    channel: 'WHATSAPP',
    isGranted: false,
    noticeVersion: null,
    grantedAt: null,
    grantedBy: null,
    revokedAt: '2026-09-29T08:00:00.000Z',
    revokedReason: 'PATIENT_KEYWORD',
  },
  isDeliveryAllowed: false,
  refusalReason: 'CONSENT_REVOKED',
};

const NEVER_ASKED_EMAIL = {
  channel: 'EMAIL',
  consent: null,
  isDeliveryAllowed: false,
  refusalReason: 'CONSENT_MISSING',
};

function mockList(channels: unknown[]): void {
  listRequestMock.mockResolvedValue({
    status: 200,
    headers: {},
    data: { data: { patientId: 'patient-1', channels } },
  } as never);
}

function renderCard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <PatientDeliveryConsentCard patientId="patient-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PatientDeliveryConsentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
  });

  it('shows each channel with its state and the reason a send is not ready', async () => {
    mockList([GRANTED_WHATSAPP, NEVER_ASKED_EMAIL]);

    renderCard();

    expect(await screen.findByText('Disetujui')).toBeInTheDocument();
    expect(screen.getByText('Belum ditanyakan')).toBeInTheDocument();
    expect(screen.getByText(/Nomor pasien belum terverifikasi/)).toBeInTheDocument();
    expect(screen.getByText(/Belum ada persetujuan untuk kanal ini/)).toBeInTheDocument();
    expect(screen.getByText(/kasir@klinik.example/)).toBeInTheDocument();
    expect(screen.getByText(/Pemberitahuan privasi v1.0/)).toBeInTheDocument();
  });

  it("names the patient's own opt-out as theirs, not the counter's", async () => {
    mockList([OPTED_OUT_WHATSAPP, NEVER_ASKED_EMAIL]);

    renderCard();

    expect(await screen.findByText('Dihentikan oleh pasien')).toBeInTheDocument();
    expect(screen.getByText(/Pasien menghentikan pengiriman/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Catat ulang persetujuan' })).toBeInTheDocument();
  });

  it('sends the channel and the answer, and nothing else, when consent is captured', async () => {
    mockList([GRANTED_WHATSAPP, NEVER_ASKED_EMAIL]);
    upsertRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: { patientId: 'patient-1', channels: [GRANTED_WHATSAPP, NEVER_ASKED_EMAIL] } },
    } as never);

    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'Catat persetujuan' }));

    await waitFor(() => {
      expect(upsertRequestMock).toHaveBeenCalledWith('patient-1', {
        channel: 'EMAIL',
        isGranted: true,
      });
    });
  });

  it('withdraws a granted consent', async () => {
    mockList([GRANTED_WHATSAPP, NEVER_ASKED_EMAIL]);
    upsertRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: { patientId: 'patient-1', channels: [] } },
    } as never);

    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'Cabut' }));

    await waitFor(() => {
      expect(upsertRequestMock).toHaveBeenCalledWith('patient-1', {
        channel: 'WHATSAPP',
        isGranted: false,
      });
    });
  });

  it('hides the actions from a reader who cannot update the patient', async () => {
    canMock.mockReturnValue(false);
    mockList([GRANTED_WHATSAPP, NEVER_ASKED_EMAIL]);

    renderCard();

    expect(await screen.findByText('Disetujui')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
