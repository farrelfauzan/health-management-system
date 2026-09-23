import type { AppointmentSessionRescheduleResult } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { MoveSessionResult } from './move-session-result';
import messages from '../../../messages/en/operations.json';

const baseSession = {
  doctorId: 'doctor-1',
  scheduleId: 'schedule-1',
  maxPatients: null,
  bookedCount: 0,
  statusReason: null,
  movedToSessionId: null,
};

function buildResult(
  blocked: AppointmentSessionRescheduleResult['blocked'],
): AppointmentSessionRescheduleResult {
  return {
    source: {
      ...baseSession,
      id: 'source',
      sessionDate: '2026-09-28',
      startTime: '08:00',
      endTime: '10:00',
      status: 'MOVED',
    },
    target: {
      ...baseSession,
      id: 'target',
      sessionDate: '2026-09-30',
      startTime: '13:00',
      endTime: '15:00',
      status: 'OPEN',
    },
    movedCount: 3,
    blocked,
  };
}

function renderResult(result: AppointmentSessionRescheduleResult): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <MoveSessionResult result={result} />
    </NextIntlClientProvider>,
  );
}

describe('MoveSessionResult', () => {
  it('says how many patients moved and where', () => {
    renderResult(buildResult([]));
    expect(screen.getByText('3 patients moved to 2026-09-30, 13:00–15:00.')).toBeInTheDocument();
    expect(
      screen.queryByText('Patients who stayed on the original schedule'),
    ).not.toBeInTheDocument();
  });

  it('lists the patients who stayed behind with a plain-language reason', () => {
    renderResult(
      buildResult([
        {
          appointmentId: 'a-1',
          reason: 'REGISTERED',
          subject: { kind: 'PATIENT', id: 'p-1', mrn: 'MRN-1', fullName: 'Siti Aminah' },
        },
        {
          appointmentId: 'a-2',
          reason: 'BPJS_BOOKING',
          subject: { kind: 'PATIENT', id: 'p-2', mrn: 'MRN-2', fullName: 'Budi Hartono' },
        },
      ]),
    );
    expect(screen.getByText('Siti Aminah')).toBeInTheDocument();
    expect(screen.getByText('Already registered for the original day')).toBeInTheDocument();
    expect(
      screen.getByText('BPJS patient: cancel the queue in BPJS, then register again'),
    ).toBeInTheDocument();
  });
});
