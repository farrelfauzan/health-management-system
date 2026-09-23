import type { AppointmentSessionStatusValue, DoctorSessionCalendarItem } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { SessionChangeActions } from './session-change-actions';
import messages from '../../../messages/en/operations.json';

const ADMIN_RULES: AppRule[] = [
  { action: 'read', subject: 'AppointmentSession' },
  { action: 'update', subject: 'AppointmentSession' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'AppointmentSession' }];

function buildSession(status: AppointmentSessionStatusValue): DoctorSessionCalendarItem {
  return {
    id: 'session-1',
    scheduleId: 'schedule-1',
    doctorId: 'doctor-1',
    sessionDate: '2026-09-28',
    startTime: '08:00',
    endTime: '10:00',
    status,
    maxPatients: null,
    bookedCount: 2,
    remaining: null,
    doctor: { id: 'doctor-1', fullName: 'Dr. Budi Santoso', specialty: 'Umum' },
  };
}

function renderActions(params: {
  rules: AppRule[];
  status: AppointmentSessionStatusValue;
  onMove?: () => void;
}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(params.rules)}>
        <SessionChangeActions
          session={buildSession(params.status)}
          onMove={params.onMove ?? vi.fn()}
          onCancel={vi.fn()}
        />
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('SessionChangeActions', () => {
  it('offers move and cancel to whoever may update any session', async () => {
    const onMoveMock = vi.fn();
    renderActions({ rules: ADMIN_RULES, status: 'OPEN', onMove: onMoveMock });
    await userEvent.click(screen.getByRole('button', { name: 'Move session' }));
    expect(onMoveMock).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancel session' })).toBeInTheDocument();
  });

  it('renders nothing for a read-only user', () => {
    renderActions({ rules: READ_ONLY_RULES, status: 'OPEN' });
    expect(screen.queryByRole('button', { name: 'Move session' })).not.toBeInTheDocument();
  });

  it.each<AppointmentSessionStatusValue>(['MOVED', 'CANCELLED'])(
    'renders nothing for a %s session',
    (status) => {
      renderActions({ rules: ADMIN_RULES, status });
      expect(screen.queryByRole('button', { name: 'Move session' })).not.toBeInTheDocument();
    },
  );
});
