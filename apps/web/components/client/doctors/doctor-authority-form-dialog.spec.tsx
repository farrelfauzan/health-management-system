import type { DoctorAuthority } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const updateAuthorityMock = vi.fn();
const createAuthorityMock = vi.fn();

vi.mock('#lib/api/generated/doctor-authorities/doctor-authorities', () => ({
  doctorAuthorityControllerCreateAuthorityV1: (...args: unknown[]) => createAuthorityMock(...args),
  doctorAuthorityControllerUpdateAuthorityV1: (...args: unknown[]) => updateAuthorityMock(...args),
  getDoctorAuthorityControllerListAuthoritiesV1QueryKey: (doctorId: string) => [
    `/api/v1/doctors/${doctorId}/authorities`,
  ],
}));

vi.mock('#lib/doctors/upload-doctor-authority-grant-document', () => ({
  uploadDoctorAuthorityGrantDocument: vi.fn(),
}));

const { DoctorAuthorityFormDialog } = await import('./doctor-authority-form-dialog');

function buildAuthority(overrides: Partial<DoctorAuthority> = {}): DoctorAuthority {
  return {
    id: 'authority-1',
    doctorId: 'midwife-1',
    kind: 'IUD_IMPLANT',
    grantKind: 'DINAS_PENETAPAN',
    grantReference: '440/123/2026',
    grantIssuedAt: '2025-12-15',
    trainingCertificateNumber: 'CTU-2025-0042',
    validFrom: '2026-01-01',
    validUntil: '2027-12-31',
    hasGrantDocument: false,
    grantDocumentMimeType: null,
    status: 'ACTIVE',
    revokedAt: null,
    revokeReason: null,
    createdAt: '2026-01-02T03:00:00.000Z',
    updatedAt: '2026-01-02T03:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(authority: DoctorAuthority): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <DoctorAuthorityFormDialog
          open
          onOpenChange={vi.fn()}
          doctorId="midwife-1"
          doctorName="Bd. Siti Aminah"
          authority={authority}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DoctorAuthorityFormDialog (P25-T02, D-036)', () => {
  beforeEach(() => {
    updateAuthorityMock.mockReset();
    createAuthorityMock.mockReset();
  });

  it('refuses to save without a training certificate number', async () => {
    renderDialog(buildAuthority({ trainingCertificateNumber: '' }));

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Nomor sertifikat pelatihan wajib diisi.')).toBeInTheDocument();
    expect(updateAuthorityMock).not.toHaveBeenCalled();
  });

  it('refuses to save without an end date: no grant is open-ended', async () => {
    renderDialog(buildAuthority({ validUntil: '' }));

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Tanggal akhir berlaku wajib diisi.')).toBeInTheDocument();
    expect(updateAuthorityMock).not.toHaveBeenCalled();
  });

  it('labels the reference by the evidence type', () => {
    renderDialog(buildAuthority({ grantKind: 'STR_ANNOTATION' }));

    expect(screen.getByText('Nomor STR')).toBeInTheDocument();
  });
});
