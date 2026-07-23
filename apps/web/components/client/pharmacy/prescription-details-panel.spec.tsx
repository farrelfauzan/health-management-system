import type { PrescriptionResponse } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrescriptionDetailsPanel } from './prescription-details-panel';
import { dispenseControllerCreateDispenseV1 } from '#lib/api/generated/pharmacy-flow/pharmacy-flow';

vi.mock('#lib/api/generated/pharmacy-flow/pharmacy-flow', () => ({
  dispenseControllerCreateDispenseV1: vi.fn(),
}));

const dispenseRequestMock = vi.mocked(dispenseControllerCreateDispenseV1);

const PHARMACIST_RULES: AppRule[] = [
  { action: 'read', subject: 'Medication' },
  { action: 'read', subject: 'Prescription' },
  { action: 'write', subject: 'DispenseRecord' },
];

const DOCTOR_RULES: AppRule[] = [
  { action: 'read', subject: 'Medication' },
  { action: 'read', subject: 'Prescription' },
];

const PRESCRIPTION: PrescriptionResponse = {
  id: '7f9c2b4a-1111-4222-8333-444455556666',
  patientId: 'aaaa1111-2222-4333-8444-555566667777',
  doctorId: 'bbbb1111-2222-4333-8444-555566667777',
  status: 'ISSUED',
  issuedAt: '2026-07-23T08:00:00.000Z',
  createdAt: '2026-07-23T08:00:00.000Z',
  updatedAt: '2026-07-23T08:00:00.000Z',
  patient: {
    id: 'aaaa1111-2222-4333-8444-555566667777',
    mrn: 'MRN-0007',
    fullName: 'Jonathan Miller',
  },
  doctor: {
    id: 'bbbb1111-2222-4333-8444-555566667777',
    licenseNumber: 'LIC-0007',
    fullName: 'Sarah Chen',
  },
  items: [
    {
      id: 'item-1',
      medicationId: 'cccc1111-2222-4333-8444-555566667777',
      medicationCode: 'AMOX-500',
      medicationName: 'Amoxicillin 500mg',
      dosage: '500 mg',
      frequency: '3x daily',
      durationDays: 7,
      quantity: 21,
      instructions: 'Take after meals.',
    },
  ],
};

function buildDispenseConflictError(): AxiosError {
  return new AxiosError(
    'Request failed with status code 409',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: {},
      data: {
        error: {
          code: 'CONFLICT',
          message: 'Insufficient stock for medication Amoxicillin 500mg',
        },
      },
    } as AxiosResponse,
  );
}

function renderPanel(params: { rules: AppRule[]; onDispensed?: (message: string) => void }): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider ability={buildAppAbility(params.rules)}>
        <PrescriptionDetailsPanel
          prescription={PRESCRIPTION}
          onDispensed={params.onDispensed ?? vi.fn()}
        />
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

async function checkAllVerificationSteps(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (const checkbox of screen.getAllByRole('checkbox')) {
    await user.click(checkbox);
  }
}

describe('PrescriptionDetailsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides Dispense Now for roles without the dispense write permission', () => {
    renderPanel({ rules: DOCTOR_RULES });

    expect(screen.queryByRole('button', { name: /Dispense Now/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print Label/ })).toBeInTheDocument();
  });

  it('keeps Dispense Now disabled until every verification step is checked', async () => {
    const user = userEvent.setup();
    renderPanel({ rules: PHARMACIST_RULES });

    const dispenseButton = screen.getByRole('button', { name: /Dispense Now/ });
    expect(dispenseButton).toBeDisabled();

    await checkAllVerificationSteps(user);

    expect(dispenseButton).toBeEnabled();
  });

  it('dispenses the full prescribed quantities and reports success', async () => {
    const user = userEvent.setup();
    const onDispensed = vi.fn();
    dispenseRequestMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: {
        data: {
          id: 'dispense-1',
          prescriptionId: PRESCRIPTION.id,
          prescriptionStatus: 'DISPENSED',
        },
        message: 'Dispense recorded',
      },
    } as never);
    renderPanel({ rules: PHARMACIST_RULES, onDispensed });

    await checkAllVerificationSteps(user);
    await user.click(screen.getByRole('button', { name: /Dispense Now/ }));

    await waitFor(() => {
      expect(dispenseRequestMock).toHaveBeenCalledWith({
        prescriptionId: PRESCRIPTION.id,
        items: [{ medicationId: PRESCRIPTION.items[0]?.medicationId, quantity: 21 }],
      });
      expect(onDispensed).toHaveBeenCalledWith('RX-7F9C2B dispensed successfully.');
    });
  });

  it('surfaces the stock-mutation error envelope and recovers', async () => {
    const user = userEvent.setup();
    const onDispensed = vi.fn();
    dispenseRequestMock.mockRejectedValue(buildDispenseConflictError());
    renderPanel({ rules: PHARMACIST_RULES, onDispensed });

    await checkAllVerificationSteps(user);
    await user.click(screen.getByRole('button', { name: /Dispense Now/ }));

    expect(
      await screen.findByText('Insufficient stock for medication Amoxicillin 500mg'),
    ).toBeInTheDocument();
    expect(onDispensed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Dispense Now/ })).toBeEnabled();
  });
});
