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
import englishMessages from '../../../messages/en/clinical.json';
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

const WITHDRAWN_EMAIL = {
  channel: 'EMAIL',
  consent: {
    channel: 'EMAIL',
    isGranted: false,
    noticeVersion: null,
    grantedAt: null,
    grantedBy: null,
    revokedAt: '2026-09-29T08:00:00.000Z',
    revokedReason: 'STAFF',
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

type Locale = 'id' | 'en';

const MESSAGES_BY_LOCALE = { id: messages, en: englishMessages } as const;

function renderCard(locale: Locale = 'id'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES_BY_LOCALE[locale]}>
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

  // P19-T12. The longest label ("Catat ulang persetujuan") used to push the
  // card past its column: the button sat on one non-wrapping line with the
  // status block. Every state's button must render, and the row must wrap.
  it.each([
    ['id', ['Cabut', 'Catat ulang persetujuan', 'Catat ulang persetujuan', 'Catat persetujuan']],
    ['en', ['Withdraw', 'Re-capture consent', 'Re-capture consent', 'Capture consent']],
  ] as const)(
    'renders a wrapping action button for all four states in %s',
    async (locale, expectedLabels) => {
      mockList([GRANTED_WHATSAPP, OPTED_OUT_WHATSAPP, WITHDRAWN_EMAIL, NEVER_ASKED_EMAIL]);

      renderCard(locale);
      const actualButtons = await screen.findAllByRole('button');

      expect(actualButtons.map((button) => button.textContent)).toEqual(expectedLabels);
      for (const button of actualButtons) {
        expect(button.className).not.toContain('whitespace-nowrap');
        expect(button.className).toContain('whitespace-normal');
        expect(button.className).not.toMatch(/\bw-\d/);
        expect(button.parentElement?.className).toContain('flex-wrap');
      }
    },
  );

  it('hides the actions from a reader who cannot update the patient', async () => {
    canMock.mockReturnValue(false);
    mockList([GRANTED_WHATSAPP, NEVER_ASKED_EMAIL]);

    renderCard();

    expect(await screen.findByText('Disetujui')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
