import type { DoctorAuthority } from '@hms/shared-types';
import { ADMIN_PORTAL_ADMIN_RULES, AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const listAuthoritiesMock = vi.fn();

vi.mock('#lib/api/generated/doctor-authorities/doctor-authorities', () => ({
  doctorAuthorityControllerListAuthoritiesV1: (...args: unknown[]) => listAuthoritiesMock(...args),
  getDoctorAuthorityControllerListAuthoritiesV1QueryKey: (doctorId: string) => [
    `/api/v1/doctors/${doctorId}/authorities`,
  ],
  doctorAuthorityControllerGetDecreeDownloadUrlV1: vi.fn(),
  doctorAuthorityControllerCreateAuthorityV1: vi.fn(),
  doctorAuthorityControllerUpdateAuthorityV1: vi.fn(),
  doctorAuthorityControllerRevokeAuthorityV1: vi.fn(),
  doctorAuthorityControllerCreateDecreeUploadUrlV1: vi.fn(),
}));

const { DoctorAuthoritiesCard } = await import('./doctor-authorities-card');

function buildAuthority(overrides: Partial<DoctorAuthority> = {}): DoctorAuthority {
  return {
    id: 'authority-1',
    doctorId: 'midwife-1',
    kind: 'IUD_IMPLANT',
    trainingCertificateNumber: null,
    decreeNumber: '440/123/2026',
    decreeIssuedAt: '2025-12-15',
    validFrom: '2026-01-01',
    validUntil: '2027-12-31',
    hasDecree: true,
    decreeMimeType: 'application/pdf',
    status: 'ACTIVE',
    revokedAt: null,
    revokeReason: null,
    createdAt: '2026-01-02T03:00:00.000Z',
    updatedAt: '2026-01-02T03:00:00.000Z',
    ...overrides,
  };
}

function renderCard(profession: 'DOCTOR' | 'MIDWIFE', rules: AppRule[]): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(rules)}>
          <DoctorAuthoritiesCard
            doctorId="midwife-1"
            doctorName="Bd. Siti Aminah"
            profession={profession}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DoctorAuthoritiesCard (P25-T02)', () => {
  beforeEach(() => {
    listAuthoritiesMock.mockReset();
    listAuthoritiesMock.mockResolvedValue({ status: 200, data: { data: [buildAuthority()] } });
  });

  it('is hidden for a DOCTOR profile, and never asks the API', () => {
    renderCard('DOCTOR', ADMIN_PORTAL_ADMIN_RULES);

    expect(screen.queryByTestId('doctor-authorities-card')).not.toBeInTheDocument();
    expect(listAuthoritiesMock).not.toHaveBeenCalled();
  });

  it('is hidden for a midwife when the viewer cannot read authorities', () => {
    renderCard('MIDWIFE', [{ action: 'read', subject: 'Doctor' }]);

    expect(screen.queryByTestId('doctor-authorities-card')).not.toBeInTheDocument();
    expect(listAuthoritiesMock).not.toHaveBeenCalled();
  });

  it('renders for a MIDWIFE with the admin preset: kind, decree, Aktif and a letter download', async () => {
    renderCard('MIDWIFE', ADMIN_PORTAL_ADMIN_RULES);

    expect(await screen.findByText('Pemasangan AKDR & implan')).toBeInTheDocument();
    expect(screen.getByText('440/123/2026')).toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unduh SK/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tambah kewenangan/ })).toBeInTheDocument();
    expect(listAuthoritiesMock.mock.calls[0]?.[0]).toBe('midwife-1');
  });

  it('shows a revoked authority as Dicabut without edit or revoke actions', async () => {
    listAuthoritiesMock.mockResolvedValue({
      status: 200,
      data: {
        data: [
          buildAuthority({
            status: 'REVOKED',
            revokedAt: '2026-06-01T02:00:00.000Z',
            revokeReason: 'SK dicabut dinas',
            hasDecree: false,
          }),
        ],
      },
    });

    renderCard('MIDWIFE', ADMIN_PORTAL_ADMIN_RULES);

    expect(await screen.findByText('Dicabut')).toBeInTheDocument();
    expect(screen.getByText('SK belum diunggah')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cabut' })).not.toBeInTheDocument();
  });
});
