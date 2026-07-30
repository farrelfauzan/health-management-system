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
  patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'Patient One' },
};

describe('SessionQueueTable', () => {
  it('forwards row clicks to onSelectEntry when provided', async () => {
    const user = userEvent.setup();
    const handleSelectEntry = vi.fn();

    render(<SessionQueueTable queue={[QUEUE_ENTRY]} onSelectEntry={handleSelectEntry} />);
    await user.click(screen.getByRole('button', { name: 'View appointment for Patient One' }));

    expect(handleSelectEntry).toHaveBeenCalledWith(QUEUE_ENTRY);
  });

  it('renders plain rows without a select handler', () => {
    render(<SessionQueueTable queue={[QUEUE_ENTRY]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Patient One')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
