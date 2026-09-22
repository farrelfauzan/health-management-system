import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PatientVisitReminderConsentCard } from './patient-visit-reminder-consent-card';
import {
  patientVisitReminderConsentControllerGetConsentV1,
  patientVisitReminderConsentControllerUpsertConsentV1,
} from '#lib/api/generated/visit-reminder-consent/visit-reminder-consent';
import englishMessages from '../../../messages/en/maternal-care.json';
import messages from '../../../messages/id/maternal-care.json';

vi.mock('#lib/api/generated/visit-reminder-consent/visit-reminder-consent', () => ({
  patientVisitReminderConsentControllerGetConsentV1: vi.fn(),
  getPatientVisitReminderConsentControllerGetConsentV1QueryKey: (patientId: string) => [
    `/api/v1/patients/${patientId}/visit-reminder-consent`,
  ],
  patientVisitReminderConsentControllerUpsertConsentV1: vi.fn(),
}));

const canMock = vi.fn<(action: string, subject: string) => boolean>(() => true);

vi.mock('@hms/ui', async () => {
  const actual = await vi.importActual<typeof import('@hms/ui')>('@hms/ui');
  return { ...actual, useAbility: () => ({ can: canMock }) };
});

const getRequestMock = vi.mocked(patientVisitReminderConsentControllerGetConsentV1);
const upsertRequestMock = vi.mocked(patientVisitReminderConsentControllerUpsertConsentV1);

const GRANTED = {
  purpose: 'VISIT_REMINDER',
  isGranted: true,
  noticeVersion: { id: 'notice-1', version: '1.0' },
  grantedAt: '2026-09-28T02:15:00.000Z',
  grantedBy: { id: 'user-1', email: 'bidan@klinik.example', name: 'Bidan Sari' },
  revokedAt: null,
  revokedReason: null,
};

const OPTED_OUT = {
  ...GRANTED,
  isGranted: false,
  grantedAt: null,
  grantedBy: null,
  noticeVersion: null,
  revokedAt: '2026-09-29T08:00:00.000Z',
  revokedReason: 'PATIENT_KEYWORD',
};

function mockConsent(consent: unknown): void {
  getRequestMock.mockResolvedValue({
    status: 200,
    headers: {},
    data: { data: { patientId: 'patient-1', consent } },
  } as never);
}

function renderCard(locale: 'id' | 'en' = 'id'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'id' ? messages : englishMessages}>
      <QueryClientProvider client={queryClient}>
        <PatientVisitReminderConsentCard patientId="patient-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PatientVisitReminderConsentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
  });

  it('offers to capture consent for a patient never asked', async () => {
    mockConsent(null);
    upsertRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: { patientId: 'patient-1', consent: GRANTED } },
    } as never);

    renderCard();
    expect(await screen.findByText('Belum ditanyakan')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Catat persetujuan' }));

    await waitFor(() => {
      expect(upsertRequestMock).toHaveBeenCalledWith('patient-1', { isGranted: true });
    });
  });

  it('shows who captured it and against which notice, and withdraws it', async () => {
    mockConsent(GRANTED);
    upsertRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: { patientId: 'patient-1', consent: OPTED_OUT } },
    } as never);

    renderCard();
    expect(await screen.findByText('Disetujui')).toBeInTheDocument();
    expect(screen.getByText(/Bidan Sari/)).toBeInTheDocument();
    expect(screen.getByText(/Pemberitahuan privasi v1.0/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cabut' }));

    await waitFor(() => {
      expect(upsertRequestMock).toHaveBeenCalledWith('patient-1', { isGranted: false });
    });
  });

  it("names the patient's own BERHENTI as hers, in English too", async () => {
    mockConsent(OPTED_OUT);

    renderCard('en');

    expect(await screen.findByText('Opted out by patient')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-capture consent' })).toBeInTheDocument();
  });

  it('hides the action from a reader who cannot update the patient', async () => {
    canMock.mockReturnValue(false);
    mockConsent(GRANTED);

    renderCard();

    expect(await screen.findByText('Disetujui')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
