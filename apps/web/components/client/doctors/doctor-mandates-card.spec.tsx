import type { DoctorMandate } from '@hms/shared-types';
import { ADMIN_PORTAL_ADMIN_RULES, AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const listMandatesMock = vi.fn();

vi.mock('#lib/api/generated/doctor-mandates/doctor-mandates', () => ({
  doctorMandateControllerListMandatesV1: (...args: unknown[]) => listMandatesMock(...args),
  getDoctorMandateControllerListMandatesV1QueryKey: (doctorId: string) => [
    `/api/v1/doctors/${doctorId}/mandates`,
  ],
  doctorMandateControllerGetInstructionDownloadUrlV1: vi.fn(),
  doctorMandateControllerCreateMandateV1: vi.fn(),
  doctorMandateControllerRevokeMandateV1: vi.fn(),
  doctorMandateControllerCreateInstructionUploadUrlV1: vi.fn(),
}));

const { DoctorMandatesCard } = await import('./doctor-mandates-card');

function buildMandate(overrides: Partial<DoctorMandate> = {}): DoctorMandate {
  return {
    id: 'mandate-1',
    midwifeDoctorId: 'midwife-1',
    mandatingDoctorId: 'doctor-1',
    mandatingDoctorName: 'dr. Budi Santoso',
    kind: 'MANDATE',
    instruction: 'Pemasangan dan pencabutan IUD pada pasien KB',
    icd9cmCodes: ['69.7', '97.71'],
    validFrom: '2026-09-01',
    validUntil: '2026-12-01',
    instructionMimeType: 'application/pdf',
    status: 'ACTIVE',
    policyWarnings: [],
    revokedAt: null,
    revokeReason: null,
    createdAt: '2026-08-30T03:00:00.000Z',
    updatedAt: '2026-08-30T03:00:00.000Z',
    ...overrides,
  };
}

function renderCard(profession: 'DOCTOR' | 'MIDWIFE', rules: AppRule[]): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(rules)}>
          <DoctorMandatesCard
            doctorId="midwife-1"
            doctorName="Bd. Siti Aminah"
            profession={profession}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DoctorMandatesCard (P25-T05)', () => {
  beforeEach(() => {
    listMandatesMock.mockReset();
    listMandatesMock.mockResolvedValue({ status: 200, data: { data: [buildMandate()] } });
  });

  it('is hidden for a DOCTOR profile, and never asks the API', () => {
    renderCard('DOCTOR', ADMIN_PORTAL_ADMIN_RULES);

    expect(screen.queryByTestId('doctor-mandates-card')).not.toBeInTheDocument();
    expect(listMandatesMock).not.toHaveBeenCalled();
  });

  it('is hidden for a viewer who may read authorities but not mandates', () => {
    renderCard('MIDWIFE', [{ action: 'read', subject: 'DoctorAuthority' }]);

    expect(screen.queryByTestId('doctor-mandates-card')).not.toBeInTheDocument();
    expect(listMandatesMock).not.toHaveBeenCalled();
  });

  it('names the granting doctor and the procedures the mandate covers', async () => {
    renderCard('MIDWIFE', ADMIN_PORTAL_ADMIN_RULES);

    expect(await screen.findByText('Mandat')).toBeInTheDocument();
    expect(screen.getByText('Diberikan oleh dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('69.7, 97.71')).toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Catat pelimpahan/ })).toBeInTheDocument();
    expect(listMandatesMock.mock.calls[0]?.[0]).toBe('midwife-1');
  });

  it('shows a policy warning without hiding the mandate', async () => {
    listMandatesMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildMandate({
            kind: 'DELEGATION',
            policyWarnings: ['DELEGATION_OUTSIDE_ABSENCE_WINDOW'],
          }),
        ],
      },
    });

    renderCard('MIDWIFE', ADMIN_PORTAL_ADMIN_RULES);

    expect(await screen.findByText('Delegatif')).toBeInTheDocument();
    expect(screen.getByText(/di luar rentang 1–3 bulan/)).toBeInTheDocument();
  });

  it('offers no revoke action once the mandate is revoked', async () => {
    listMandatesMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildMandate({
            status: 'REVOKED',
            revokedAt: '2026-10-01T02:00:00.000Z',
            revokeReason: 'Dokter pindah praktik',
          }),
        ],
      },
    });

    renderCard('MIDWIFE', ADMIN_PORTAL_ADMIN_RULES);

    expect(await screen.findByText('Dicabut')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cabut' })).not.toBeInTheDocument();
  });
});
