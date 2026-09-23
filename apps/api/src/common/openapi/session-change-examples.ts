/**
 * OpenAPI examples for an admin's changes to a practice-session occurrence
 * (P28): materialise, cancel with a reason, and move within the same week.
 */
const sourceSessionId = '7b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41';
const targetSessionId = '7b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a42';
const doctorId = '22222222-2222-4222-8222-222222222222';
const scheduleId = '99999999-9999-4999-8999-999999999999';

const openSession = {
  id: sourceSessionId,
  doctorId,
  scheduleId,
  sessionDate: '2026-09-28',
  startTime: '08:00',
  endTime: '10:00',
  maxPatients: 10,
  status: 'OPEN',
  bookedCount: 4,
  statusReason: null,
  movedToSessionId: null,
};

export const SESSION_CHANGE_EXAMPLES = {
  materializeRequest: { scheduleId, sessionDate: '2026-09-28' },
  session: openSession,
  cancelRequest: { reason: 'Dokter berhalangan hadir karena sakit' },
  cancelResult: {
    session: {
      ...openSession,
      status: 'CANCELLED',
      bookedCount: 0,
      statusReason: 'Dokter berhalangan hadir karena sakit',
    },
    cancelledCount: 4,
  },
  rescheduleRequest: {
    sessionDate: '2026-09-30',
    startTime: '13:00',
    endTime: '15:00',
    maxPatients: 10,
    reason: 'Dokter ada tugas di rumah sakit pada Senin pagi',
  },
  rescheduleResult: {
    source: {
      ...openSession,
      status: 'MOVED',
      bookedCount: 1,
      statusReason: 'Dokter ada tugas di rumah sakit pada Senin pagi',
      movedToSessionId: targetSessionId,
    },
    target: {
      ...openSession,
      id: targetSessionId,
      sessionDate: '2026-09-30',
      startTime: '13:00',
      endTime: '15:00',
      bookedCount: 3,
    },
    movedCount: 3,
    blocked: [
      {
        appointmentId: '5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d',
        reason: 'BPJS_BOOKING',
        subject: {
          kind: 'PATIENT',
          id: '11111111-1111-4111-8111-111111111111',
          mrn: 'MRN-000123',
          fullName: 'Siti Aminah',
        },
      },
    ],
  },
} as const;
