import type { ReactNode } from 'react';
import type { SessionQueueEntry } from '@hms/shared-types';
import { render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { SessionQueueTable } from './session-queue-table';
import messages from '../../../messages/en/operations.json';

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const QUEUE_ENTRY: SessionQueueEntry = {
  appointmentId: 'appointment-1',
  queueNumber: 2,
  status: 'SCHEDULED',
  reason: 'Routine check',
  subject: { kind: 'PATIENT', id: 'patient-1', mrn: 'MRN-0001', fullName: 'Patient One' },
};

const PROSPECTIVE_QUEUE_ENTRY: SessionQueueEntry = {
  appointmentId: 'appointment-2',
  queueNumber: 3,
  status: 'SCHEDULED',
  reason: 'Booked over WhatsApp',
  subject: { kind: 'PROSPECTIVE_PATIENT', id: 'prospective-1', fullName: 'Siti Rahayu' },
};

describe('SessionQueueTable', () => {
  it('forwards row clicks to onSelectEntry when provided', async () => {
    const user = userEvent.setup();
    const handleSelectEntry = vi.fn();

    render(<SessionQueueTable queue={[QUEUE_ENTRY]} onSelectEntry={handleSelectEntry} />);
    await user.click(screen.getByRole('button', { name: 'View appointment for Patient One' }));

    expect(handleSelectEntry).toHaveBeenCalledWith(QUEUE_ENTRY);
  });

  it('badges a prospective patient instead of leaving the MRN line blank', () => {
    render(<SessionQueueTable queue={[PROSPECTIVE_QUEUE_ENTRY]} />);

    expect(screen.getByText('Siti Rahayu')).toBeInTheDocument();
    // The whole point: an empty line here reads as an MRN that failed to load,
    // and a clerk who reads it that way registers this person a second time.
    expect(screen.getByText('Not yet registered')).toBeInTheDocument();
  });

  it('shows the MRN for someone the clinic has already registered', () => {
    render(<SessionQueueTable queue={[QUEUE_ENTRY]} />);

    expect(screen.getByText('MRN-0001')).toBeInTheDocument();
    expect(screen.queryByText('Not yet registered')).not.toBeInTheDocument();
  });

  it('renders plain rows without a select handler', () => {
    render(<SessionQueueTable queue={[QUEUE_ENTRY]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Patient One')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
