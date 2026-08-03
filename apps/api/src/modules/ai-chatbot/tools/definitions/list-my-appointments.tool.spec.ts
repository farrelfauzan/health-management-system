import { ConfigService } from '@nestjs/config';

import { AI_CHAT_TOOL_LIST_PAGE_LIMIT } from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { AppointmentManagementService } from '../../../appointment-management/service/appointment-management.service';
import { ListMyAppointmentsTool } from './list-my-appointments.tool';

describe('ListMyAppointmentsTool', () => {
  const mockUser: CurrentUser = { sub: 'doctor-user-1', email: 'doctor@clinic.local' };

  /**
   * The real `toAppointmentListItem` shape, including the patient's `mrn` and
   * the two free-text fields — `reason` and `notes` — that are the likeliest
   * place a clinical narrative ends up.
   */
  function buildAppointment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-1',
      type: 'CONSULTATION',
      sessionId: 'session-1',
      queueNumber: 4,
      scheduledAt: '2026-08-03T02:30:00.000Z',
      status: 'SCHEDULED',
      reason: 'Kontrol tekanan darah, keluhan pusing sejak seminggu',
      notes: 'Bawa hasil lab terakhir',
      createdById: 'staff-9',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      patient: { id: 'patient-1', mrn: 'MRN00000042', fullName: 'Budi Santoso' },
      doctor: { id: 'doctor-1', fullName: 'dr. Siti', specialty: 'Umum' },
      ...overrides,
    };
  }

  function buildTool(
    listAppointments: jest.Mock,
    env: Record<string, string> = { CLINIC_TIMEZONE: 'Asia/Jakarta' },
  ): ListMyAppointmentsTool {
    return new ListMyAppointmentsTool(
      { listAppointments } as unknown as AppointmentManagementService,
      new ConfigService(env),
    );
  }

  it('requires appointment.read resolved to OWN', () => {
    expect(buildTool(jest.fn()).requiredPermission).toEqual({
      resource: 'Appointment',
      action: 'read',
      scope: 'OWN',
    });
  });

  it('resolves an omitted date to today in the clinic timezone, server-side', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T20:00:00.000Z'));
    const mockListAppointments = jest
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });

    const actualResult = await buildTool(mockListAppointments).execute(mockUser, {});

    // 20:00 UTC is already the 4th in Jakarta (UTC+7). A model asked for
    // today's date would answer from its training data; the server does not
    // have that problem, so it is the server that decides.
    expect(actualResult.date).toBe('2026-08-04');
    expect(mockListAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT }),
      mockUser,
    );
    jest.useRealTimers();
  });

  it('bounds the query to one clinic day for an explicit date', async () => {
    const mockListAppointments = jest
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });

    const actualResult = await buildTool(mockListAppointments).execute(mockUser, {
      date: '2026-08-10',
    });

    expect(actualResult.date).toBe('2026-08-10');
    const [query] = mockListAppointments.mock.calls[0] as [Record<string, string>];
    // Jakarta midnight is 17:00 UTC the day before, and the window is exactly
    // 24 hours wide.
    expect(query.scheduledFrom).toBe('2026-08-09T17:00:00.000Z');
    expect(query.scheduledTo).toBe('2026-08-10T17:00:00.000Z');
  });

  it('projects each slot and drops the MRN and both free-text fields', async () => {
    const mockListAppointments = jest
      .fn()
      .mockResolvedValue({ items: [buildAppointment()], meta: { page: 1, limit: 20, total: 1 } });

    const actualResult = await buildTool(mockListAppointments).execute(mockUser, {
      date: '2026-08-03',
    });

    expect(actualResult.items).toEqual([
      {
        appointmentId: 'appointment-1',
        patientId: 'patient-1',
        patientName: 'Budi Santoso',
        scheduledAt: '2026-08-03T02:30:00.000Z',
        status: 'SCHEDULED',
        type: 'CONSULTATION',
        queueNumber: 4,
      },
    ]);
    const serialized = JSON.stringify(actualResult);
    expect(serialized).not.toContain('MRN00000042');
    expect(serialized).not.toContain('Kontrol tekanan darah');
    expect(serialized).not.toContain('Bawa hasil lab');
    expect(serialized).not.toContain('staff-9');
  });

  it('cannot leak a clinical field a future projection edit adds', async () => {
    const mockListAppointments = jest.fn().mockResolvedValue({
      items: [buildAppointment({ diagnosisSummary: 'Hipertensi grade II', nik: '3273010101900001' })],
      meta: { page: 1, limit: 20, total: 1 },
    });

    const actualResult = await buildTool(mockListAppointments).execute(mockUser, {});

    const serialized = JSON.stringify(actualResult);
    expect(serialized).not.toContain('Hipertensi');
    expect(serialized).not.toContain('3273010101900001');
  });

  it('omits an absent queue number rather than inventing one', async () => {
    const mockListAppointments = jest.fn().mockResolvedValue({
      items: [buildAppointment({ queueNumber: undefined })],
      meta: { page: 1, limit: 20, total: 1 },
    });

    const actualResult = await buildTool(mockListAppointments).execute(mockUser, {});

    expect(actualResult.items[0]?.queueNumber).toBeUndefined();
  });

  it('reports the total rather than the page length', async () => {
    const mockListAppointments = jest
      .fn()
      .mockResolvedValue({ items: [buildAppointment()], meta: { page: 1, limit: 20, total: 31 } });

    const actualResult = await buildTool(mockListAppointments).execute(mockUser, {});

    expect(actualResult.matchCount).toBe(31);
    expect(actualResult.items).toHaveLength(1);
  });

  it('falls back to the default clinic timezone when none is configured', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T20:00:00.000Z'));
    const mockListAppointments = jest
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });

    const actualResult = await buildTool(mockListAppointments, {}).execute(mockUser, {});

    expect(actualResult.date).toBe('2026-08-04');
    jest.useRealTimers();
  });
});
