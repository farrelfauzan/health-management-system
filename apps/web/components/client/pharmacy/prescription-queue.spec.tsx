import type { ReactNode } from 'react';
import type { PrescriptionResponse } from '@hms/shared-types';
import { render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { PrescriptionQueue } from './prescription-queue';
import messages from '../../../messages/en/operations.json';

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

function buildPrescription(overrides: Partial<PrescriptionResponse>): PrescriptionResponse {
  return {
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
        quantity: 21,
      },
    ],
    ...overrides,
  };
}

type QueueProps = Parameters<typeof PrescriptionQueue>[0];

function buildQueueProps(overrides: Partial<QueueProps>): QueueProps {
  return {
    prescriptions: [buildPrescription({})],
    isPending: false,
    isError: false,
    isFetching: false,
    filter: 'ALL',
    onFilterChange: vi.fn(),
    selectedPrescriptionId: null,
    onSelect: vi.fn(),
    page: 1,
    pageSize: 10,
    total: 1,
    onPageChange: vi.fn(),
    ...overrides,
  };
}

describe('PrescriptionQueue', () => {
  it('renders prescription cards with RX number, patient, and priority badge', () => {
    render(<PrescriptionQueue {...buildQueueProps({})} />);

    expect(screen.getByText('RX-7F9C2B')).toBeInTheDocument();
    expect(screen.getByText('Jonathan Miller')).toBeInTheDocument();
    expect(screen.getByText('#MRN-0007')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
    expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
  });

  it('notifies the parent when a prescription card is selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const prescription = buildPrescription({});
    render(<PrescriptionQueue {...buildQueueProps({ prescriptions: [prescription], onSelect })} />);

    await user.click(screen.getByRole('button', { name: /RX-7F9C2B/ }));

    expect(onSelect).toHaveBeenCalledWith(prescription);
  });

  it('shows the STAT empty state because no real row carries a STAT priority', () => {
    render(<PrescriptionQueue {...buildQueueProps({ filter: 'STAT' })} />);

    expect(screen.getByText('No STAT prescriptions')).toBeInTheDocument();
    expect(screen.queryByText('RX-7F9C2B')).not.toBeInTheDocument();
  });

  it('renders skeleton cards while the queue is loading', () => {
    render(<PrescriptionQueue {...buildQueueProps({ prescriptions: [], isPending: true })} />);

    expect(screen.getByTestId('prescription-queue-skeleton')).toBeInTheDocument();
  });

  it('renders the error empty state when the queue fails to load', () => {
    render(<PrescriptionQueue {...buildQueueProps({ prescriptions: [], isError: true })} />);

    expect(screen.getByText('Unable to load the prescription queue')).toBeInTheDocument();
  });
});
