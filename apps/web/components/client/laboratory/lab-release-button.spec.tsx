import type { LabOrderBenchView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { LabReleaseButton } from './lab-release-button';
import operationsMessages from '../../../messages/id/operations.json';

const analystId = 'u-analyst';
const doctorId = 'u-doctor';

function buildBench(overrides: Partial<LabOrderBenchView['order']> = {}): LabOrderBenchView {
  return {
    order: {
      id: 'o1',
      orderNumber: 'LAB/20260907/0001',
      encounterId: 'e1',
      registrationId: 'r1',
      source: 'ENCOUNTER' as const,
      patientId: 'p1',
      orderedById: 'd1',
      orderedByName: 'dr. Andi',
      status: 'RESULTED',
      priority: 'ROUTINE',
      isFasting: false,
      fulfilmentSite: 'INTERNAL',
      chargeMode: 'CLINIC',
      recollectCount: 0,
      orderedAt: '2026-09-07T00:00:00.000Z',
      items: [
        {
          id: 'i1',
          labTestId: 't1',
          code: 'HB',
          name: 'Hemoglobin',
          specimenType: 'WHOLE_BLOOD',
          resultType: 'NUMERIC',
          status: 'RESULTED',
        },
      ],
      specimens: [],
      ...overrides,
    },
    patient: {
      id: 'p1',
      fullName: 'Siti',
      mrn: 'MRN1',
      dateOfBirth: '1990-04-12',
      sex: 'FEMALE',
      ageYears: 36,
    },
    results: [
      {
        id: 'r1',
        labOrderItemId: 'i1',
        version: 1,
        valueNumeric: 11.2,
        enteredById: analystId,
        enteredAt: '2026-09-07T02:00:00.000Z',
        verifiedUnderSingleOperator: false,
      },
    ],
  };
}

type RenderParams = {
  bench?: LabOrderBenchView;
  settings?: { technicianMayVerify: boolean; singleOperator: boolean };
  canVerify?: boolean;
  currentUserId?: string;
  isTechnicianOnly?: boolean;
};

function renderButton(params: RenderParams = {}): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={operationsMessages} timeZone="Asia/Jakarta">
        <LabReleaseButton
          bench={params.bench ?? buildBench()}
          settings={params.settings ?? { technicianMayVerify: false, singleOperator: false }}
          canVerify={params.canVerify ?? true}
          currentUserId={params.currentUserId ?? doctorId}
          isTechnicianOnly={params.isTechnicianOnly ?? false}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * The Rilis button is permission-gated and rule-explained: it never renders
 * without `lab-result.verify`, and when it renders disabled it says why. The
 * API refuses each of these on the click too; this is the sentence that
 * saves the click.
 */
describe('LabReleaseButton', () => {
  it('does not render without the verify permission', () => {
    renderButton({ canVerify: false });

    expect(screen.queryByTestId('lab-release-button')).not.toBeInTheDocument();
  });

  it('is pressable for a second person once every test has a value', () => {
    renderButton();

    expect(screen.getByTestId('lab-release-button')).toBeEnabled();
  });

  it('refuses the person who typed the values, and says so', () => {
    renderButton({ currentUserId: analystId });

    expect(screen.getByTestId('lab-release-button')).toBeDisabled();
    expect(screen.getByText(/orang kedua yang merilisnya/i)).toBeInTheDocument();
  });

  it('lets one person do both where the clinic runs single-operator', () => {
    renderButton({
      currentUserId: analystId,
      settings: { technicianMayVerify: true, singleOperator: true },
    });

    expect(screen.getByTestId('lab-release-button')).toBeEnabled();
    expect(screen.getByText(/operator tunggal/i)).toBeInTheDocument();
  });

  it('refuses a technician where the clinic has not said they may verify', () => {
    renderButton({ isTechnicianOnly: true });

    expect(screen.getByTestId('lab-release-button')).toBeDisabled();
    expect(screen.getByText(/dokter atau administrator/i)).toBeInTheDocument();
  });

  it('waits while a test still has no value', () => {
    renderButton({
      bench: buildBench({
        items: [
          {
            id: 'i1',
            labTestId: 't1',
            code: 'HB',
            name: 'Hemoglobin',
            specimenType: 'WHOLE_BLOOD',
            resultType: 'NUMERIC',
            status: 'PENDING',
          },
        ],
      }),
    });

    expect(screen.getByTestId('lab-release-button')).toBeDisabled();
    expect(screen.getByText(/belum ada nilainya/i)).toBeInTheDocument();
  });

  // P18-T14. The click opens the release dialog, where the note lives; the
  // release itself happens on the dialog's confirm.
  it('opens the release dialog with its note field on the click', async () => {
    renderButton();

    await userEvent.click(screen.getByTestId('lab-release-button'));

    expect(screen.getByTestId('lab-release-note')).toBeInTheDocument();
    expect(screen.getByTestId('lab-release-confirm')).toBeInTheDocument();
  });

  it('disappears once the order is released', () => {
    renderButton({ bench: buildBench({ status: 'RELEASED' }) });

    expect(screen.queryByTestId('lab-release-button')).not.toBeInTheDocument();
  });
});
