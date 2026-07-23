import type { DoctorSessionListItem } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionOptionCard } from './session-option-card';

function buildSession(overrides: Partial<DoctorSessionListItem>): DoctorSessionListItem {
  return {
    id: null,
    scheduleId: 'schedule-1',
    doctorId: 'doctor-1',
    sessionDate: '2026-07-27',
    startTime: '08:00',
    endTime: '12:00',
    status: 'OPEN',
    maxPatients: 10,
    bookedCount: 3,
    remaining: 7,
    ...overrides,
  };
}

describe('SessionOptionCard', () => {
  it('shows the window and capacity and forwards selection', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const session = buildSession({});

    render(<SessionOptionCard session={session} isSelected={false} onSelect={handleSelect} />);
    await user.click(screen.getByRole('button'));

    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
    expect(screen.getByText('3/10 booked')).toBeInTheDocument();
    expect(handleSelect).toHaveBeenCalledWith(session);
  });

  it('shows unlimited capacity without a limit', () => {
    render(
      <SessionOptionCard
        session={buildSession({ maxPatients: null, remaining: null, bookedCount: 12 })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('12 booked · unlimited')).toBeInTheDocument();
  });

  it('disables a full session', () => {
    render(
      <SessionOptionCard
        session={buildSession({ bookedCount: 10, remaining: 0 })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText(/full/)).toBeInTheDocument();
  });

  it('disables a closed session', () => {
    render(
      <SessionOptionCard
        session={buildSession({ status: 'CLOSED' })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText(/closed/)).toBeInTheDocument();
  });
});
