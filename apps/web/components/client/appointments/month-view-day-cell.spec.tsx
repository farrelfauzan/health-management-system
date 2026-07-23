import type { AppointmentListItem } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MonthViewDayCell } from './month-view-day-cell';

function buildAppointment(id: string, fullName: string): AppointmentListItem {
  return {
    id,
    patientId: `patient-${id}`,
    doctorId: 'doctor-1',
    type: 'SPECIAL_REQUEST',
    scheduledAt: new Date(2026, 6, 21, 10, 30).toISOString(),
    status: 'SCHEDULED',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    patient: { id: `patient-${id}`, mrn: `MRN-${id}`, fullName },
    doctor: { id: 'doctor-1', fullName: 'Dr. Budi Santoso', specialty: 'Cardiology' },
  };
}

const DAY = new Date(2026, 6, 21);

describe('MonthViewDayCell', () => {
  it('renders event chips and forwards chip selection', async () => {
    const user = userEvent.setup();
    const handleSelectAppointment = vi.fn();
    const appointment = buildAppointment('a1', 'John Doe');
    render(
      <MonthViewDayCell
        day={DAY}
        isCurrentMonth
        isToday={false}
        appointments={[appointment]}
        sessions={[]}
        onSelectAppointment={handleSelectAppointment}
        onSelectSession={vi.fn()}
        onSelectDay={vi.fn()}
      />,
    );

    await user.click(screen.getByText('John Doe'));

    expect(handleSelectAppointment).toHaveBeenCalledWith(appointment);
  });

  it('collapses overflow into a "+N more" drill-down to the day', async () => {
    const user = userEvent.setup();
    const handleSelectDay = vi.fn();
    const appointments = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) =>
      buildAppointment(id, `Patient ${id}`),
    );
    render(
      <MonthViewDayCell
        day={DAY}
        isCurrentMonth
        isToday={false}
        appointments={appointments}
        sessions={[]}
        onSelectAppointment={vi.fn()}
        onSelectSession={vi.fn()}
        onSelectDay={handleSelectDay}
      />,
    );

    expect(screen.getByText('Patient a3')).toBeInTheDocument();
    expect(screen.queryByText('Patient a4')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+2 more' }));

    expect(handleSelectDay).toHaveBeenCalledWith(DAY);
  });

  it('navigates to the day when the date number is clicked', async () => {
    const user = userEvent.setup();
    const handleSelectDay = vi.fn();
    render(
      <MonthViewDayCell
        day={DAY}
        isCurrentMonth={false}
        isToday={false}
        appointments={[]}
        sessions={[]}
        onSelectAppointment={vi.fn()}
        onSelectSession={vi.fn()}
        onSelectDay={handleSelectDay}
      />,
    );

    await user.click(screen.getByRole('button', { name: `Open ${DAY.toDateString()}` }));

    expect(handleSelectDay).toHaveBeenCalledWith(DAY);
  });
});
