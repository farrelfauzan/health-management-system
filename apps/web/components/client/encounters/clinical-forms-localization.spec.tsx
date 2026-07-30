import type { EncounterDetail } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/id/clinical.json';
import { EncounterDiagnosesCard } from './encounter-diagnoses-card';
import { EncounterProceduresCard } from './encounter-procedures-card';
import { EncounterSoapCard } from './encounter-soap-card';
import { EncounterVitalsCard } from './encounter-vitals-card';

const ENCOUNTER = {
  id: 'encounter-1',
  registrationId: 'registration-1',
  patientId: 'patient-1',
  doctorId: 'doctor-1',
  status: 'IN_PROGRESS',
  startedAt: '2026-07-30T08:00:00.000Z',
  createdAt: '2026-07-30T08:00:00.000Z',
  updatedAt: '2026-07-30T08:00:00.000Z',
  patient: { id: 'patient-1', mrn: 'MRN-001', fullName: 'Aisha Rahman' },
  doctor: { id: 'doctor-1', licenseNumber: 'SIP-001', fullName: 'dr. Budi' },
  vitalSigns: [],
  diagnoses: [],
  procedures: [],
  prescriptions: [],
} satisfies EncounterDetail;

function renderLocalized(node: React.ReactNode): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('clinical encounter forms localization', () => {
  it('renders Indonesian SOAP section labels and placeholders', () => {
    renderLocalized(<EncounterSoapCard encounter={ENCOUNTER} isEditable />);

    expect(screen.getByText('Catatan Klinis (SOAP)')).toBeInTheDocument();
    expect(screen.getByLabelText('Subjektif')).toHaveAttribute(
      'placeholder',
      'Keluhan, riwayat, dan gejala yang disampaikan pasien.',
    );
    expect(screen.getByRole('button', { name: 'Simpan Catatan' })).toBeInTheDocument();
  });

  it('renders Indonesian diagnosis and procedure empty states', () => {
    renderLocalized(
      <>
        <EncounterDiagnosesCard encounterId="encounter-1" diagnoses={[]} isEditable={false} />
        <EncounterProceduresCard encounterId="encounter-1" procedures={[]} isEditable={false} />
      </>,
    );

    expect(screen.getByText('Diagnosis (ICD-10)')).toBeInTheDocument();
    expect(screen.getByText(/Belum ada diagnosis berkode/)).toBeInTheDocument();
    expect(screen.getByText('Tindakan (ICD-9-CM)')).toBeInTheDocument();
    expect(screen.getByText(/Belum ada tindakan berkode/)).toBeInTheDocument();
  });

  it('renders localized vital-sign labels and units', () => {
    renderLocalized(<EncounterVitalsCard encounterId="encounter-1" vitalSigns={[]} isEditable />);

    expect(screen.getByText('Tanda Vital')).toBeInTheDocument();
    expect(screen.getByText('Denyut nadi')).toBeInTheDocument();
    expect(screen.getByText('(kali/mnt)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Catat Pengukuran' })).toBeInTheDocument();
  });
});
