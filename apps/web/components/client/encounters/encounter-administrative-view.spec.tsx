import type { EncounterDetail } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const { useEncounterDetailMock } = vi.hoisted(() => ({
  useEncounterDetailMock: vi.fn(),
}));

vi.mock('#lib/encounters/use-encounter-detail', () => ({
  useEncounterDetail: (encounterId: string) => useEncounterDetailMock(encounterId),
}));
vi.mock('#lib/navigation/use-shell-breadcrumb-root', () => ({
  useShellBreadcrumbRoot: () => ({ label: 'Dasbor', href: '/admin/dashboard' }),
}));
vi.mock('#components/shared/page-header', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock('#components/client/encounters/encounter-summary-card', () => ({
  EncounterSummaryCard: () => <div data-testid="summary-card" />,
}));
vi.mock('#components/client/encounters/encounter-vitals-card', () => ({
  EncounterVitalsCard: ({ isEditable }: { isEditable: boolean }) => (
    <div data-testid="vitals-card" data-editable={String(isEditable)} />
  ),
}));
vi.mock('#components/client/billing/generate-invoice-dialog', () => ({
  GenerateInvoiceDialog: ({ encounterId }: { encounterId: string }) => (
    <div data-testid="generate-invoice-dialog">{encounterId}</div>
  ),
}));

const { EncounterAdministrativeView } = await import('./encounter-administrative-view');

const TRIAGE_RULES: AppRule[] = [{ action: 'record-vitals', subject: 'Encounter' }];
const CASHIER_RULES: AppRule[] = [
  { action: 'read', subject: 'Encounter' },
  { action: 'write', subject: 'Invoice' },
];

function buildEncounter(status: EncounterDetail['status']): EncounterDetail {
  return {
    id: 'encounter-1',
    registrationId: 'registration-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    status,
    startedAt: '2026-09-23T02:00:00.000Z',
    createdAt: '2026-09-23T02:00:00.000Z',
    updatedAt: '2026-09-23T02:00:00.000Z',
    patient: { id: 'patient-1', mrn: '00000001', fullName: 'Aisha Rahman' },
    doctor: {
      id: 'doctor-1',
      licenseNumber: 'SIP-1',
      fullName: 'Dr. Budi',
      satusehatReportable: true,
      profession: 'DOCTOR',
    },
    vitalSigns: [],
    diagnoses: [],
    procedures: [],
    immunizations: [],
    prescriptions: [],
    labOrders: [],
    labResults: [],
  };
}

function renderView(rules: AppRule[], status: EncounterDetail['status']): void {
  useEncounterDetailMock.mockReturnValue({ isPending: false, encounter: buildEncounter(status) });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(rules)}>
        <EncounterAdministrativeView encounterId="encounter-1" />
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('EncounterAdministrativeView (P22-T03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives triage an editable vitals card on an open visit', () => {
    renderView(TRIAGE_RULES, 'IN_PROGRESS');

    expect(screen.getByTestId('vitals-card')).toHaveAttribute('data-editable', 'true');
  });

  it('keeps the vitals card read-only once the doctor has closed the visit', () => {
    renderView(TRIAGE_RULES, 'FINISHED');

    expect(screen.getByTestId('vitals-card')).toHaveAttribute('data-editable', 'false');
  });

  it('shows no vitals to an administrator without record-vitals', () => {
    renderView(CASHIER_RULES, 'IN_PROGRESS');

    expect(screen.queryByTestId('vitals-card')).toBeNull();
  });

  it('offers invoice generation on a finished visit to an invoice writer', async () => {
    renderView(CASHIER_RULES, 'FINISHED');

    await userEvent.click(screen.getByRole('button', { name: /Buat Tagihan/ }));

    expect(screen.getByTestId('generate-invoice-dialog')).toHaveTextContent('encounter-1');
  });

  it('offers no invoice while the visit is still open', () => {
    renderView(CASHIER_RULES, 'IN_PROGRESS');

    expect(screen.queryByRole('button', { name: /Buat Tagihan/ })).toBeNull();
  });

  it('offers no invoice to triage without invoice.write', () => {
    renderView(TRIAGE_RULES, 'FINISHED');

    expect(screen.queryByRole('button', { name: /Buat Tagihan/ })).toBeNull();
  });
});
