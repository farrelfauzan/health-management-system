import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { DoctorFormDialog } from './doctor-form-dialog';
import clinicalMessages from '../../../messages/id/clinical.json';
import sharedMessages from '../../../messages/id/shared.json';

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorManagementControllerCreateDoctorV1: vi.fn(),
  doctorManagementControllerUpdateDoctorV1: vi.fn(),
}));

vi.mock('#lib/patients/use-patients-list', () => ({
  usePatientsList: () => ({ patients: [], isLoading: false, isError: false }),
}));

vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({ specialties: [], isLoading: false, isError: false }),
}));

function renderCreateDialog(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale="id"
        messages={{ ...clinicalMessages, ...sharedMessages }}
        timeZone="Asia/Jakarta"
      >
        <DoctorFormDialog open onOpenChange={() => undefined} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('doctor form licence guidance (P19-T13)', () => {
  it('labels the flat licence field as the STR number', () => {
    renderCreateDialog();
    expect(screen.getByLabelText(/^Nomor STR/)).toBeInTheDocument();
  });

  it('describes the field with a line the input points at', () => {
    renderCreateDialog();
    const input = screen.getByLabelText(/^Nomor STR/);
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy ?? '');
    expect(description?.textContent).toContain('SATUSEHAT SDMK');
  });

  it('offers an info tooltip trigger named after the visible label', () => {
    renderCreateDialog();
    expect(screen.getByRole('button', { name: 'Selengkapnya tentang Nomor STR' })).toBeVisible();
  });

  it('shows a real-shaped STR placeholder rather than a SIP-shaped one', () => {
    renderCreateDialog();
    expect(screen.getByLabelText(/^Nomor STR/)).toHaveAttribute(
      'placeholder',
      'AB12345678901234',
    );
  });
});
