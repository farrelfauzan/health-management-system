import type { DoctorListItem, RegistrationListItem } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const openEncounterMock = vi.hoisted(() => vi.fn());
const doctorsMock = vi.hoisted(() => ({ doctors: [] as DoctorListItem[] }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('#lib/api/generated/encounters/encounters', () => ({
  encounterControllerOpenEncounterV1: (...args: unknown[]) => openEncounterMock(...args),
}));

vi.mock('#lib/api/notify-api-error', () => ({
  notifyApiError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('#lib/doctors/use-doctors-list', () => ({
  useDoctorsList: () => ({ doctors: doctorsMock.doctors, isPending: false }),
}));

const { EncounterOpenDialog } = await import('./encounter-open-dialog');

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function yearsAgo(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return toIsoDate(date);
}

function buildDoctor(profession: 'DOCTOR' | 'MIDWIFE'): DoctorListItem {
  return {
    id: 'clinician-1',
    fullName: profession === 'MIDWIFE' ? 'Bd. Uji' : 'dr. Uji',
    specialty: 'Umum',
    profession,
  } as DoctorListItem;
}

function buildRegistration(dateOfBirth: string): RegistrationListItem {
  return {
    id: 'registration-1',
    patientId: 'patient-1',
    status: 'CHECKED_IN',
    registeredAt: '2026-09-15T01:00:00.000Z',
    createdAt: '2026-09-15T01:00:00.000Z',
    updatedAt: '2026-09-15T01:00:00.000Z',
    patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'Pasien Uji', dateOfBirth },
    appointment: {
      id: 'appointment-1',
      scheduledAt: '2026-09-15T01:00:00.000Z',
      status: 'SCHEDULED',
      doctor: { id: 'clinician-1', fullName: 'Klinisi Uji', specialty: 'Umum' },
    },
  };
}

function renderDialog(params: { profession: 'DOCTOR' | 'MIDWIFE'; dateOfBirth: string }): void {
  doctorsMock.doctors = [buildDoctor(params.profession)];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <EncounterOpenDialog
          open
          onOpenChange={vi.fn()}
          registration={buildRegistration(params.dateOfBirth)}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('EncounterOpenDialog child visit purpose (P25-T03)', () => {
  beforeEach(() => {
    openEncounterMock.mockReset();
  });

  it('asks a midwife for the purpose of a visit for a child under five', () => {
    renderDialog({ profession: 'MIDWIFE', dateOfBirth: yearsAgo(3) });

    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Anak sakit (MTBS)' })).toBeTruthy();
    expect(
      screen.getByRole('radio', {
        name: 'Kunjungan anak sehat (KN, imunisasi, tumbuh kembang)',
      }),
    ).toBeTruthy();
  });

  it('does not ask a midwife about an adult patient', () => {
    renderDialog({ profession: 'MIDWIFE', dateOfBirth: '1990-01-01' });

    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('never asks a doctor, even for a child under five', () => {
    renderDialog({ profession: 'DOCTOR', dateOfBirth: yearsAgo(3) });

    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('sends the chosen purpose and renders the inline authority refusal', async () => {
    openEncounterMock.mockRejectedValue(
      new AxiosError('Unprocessable', '422', undefined, undefined, {
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          error: {
            code: 'MIDWIFE_AUTHORITY_REQUIRED',
            message: 'refused',
            details: { kind: 'MTBS' },
          },
        },
      }),
    );
    renderDialog({ profession: 'MIDWIFE', dateOfBirth: yearsAgo(3) });

    fireEvent.click(screen.getByRole('radio', { name: 'Anak sakit (MTBS)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buka Kunjungan' }));

    await waitFor(() => {
      expect(screen.getByTestId('midwife-authority-refusal')).toBeTruthy();
    });
    expect(openEncounterMock.mock.calls[0]?.[0]).toEqual({
      registrationId: 'registration-1',
      doctorId: 'clinician-1',
      childVisitPurpose: 'SICK_CHILD',
    });
    expect(screen.getByText('Rujuk ke dokter atau puskesmas')).toBeTruthy();
  });
});
