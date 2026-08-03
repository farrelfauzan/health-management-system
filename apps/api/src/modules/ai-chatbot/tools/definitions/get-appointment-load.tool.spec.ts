import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { AppointmentManagementService } from '../../../appointment-management/service/appointment-management.service';
import { GetAppointmentLoadTool } from './get-appointment-load.tool';

describe('GetAppointmentLoadTool', () => {
  const mockUser: CurrentUser = { sub: 'admin-user-1', email: 'admin@clinic.local' };

  function buildSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'session-1',
      scheduleId: 'schedule-1',
      doctorId: 'doctor-1',
      sessionDate: '2026-08-03',
      startTime: '08:00',
      endTime: '12:00',
      status: 'OPEN',
      maxPatients: 20,
      bookedCount: 14,
      remaining: 6,
      doctor: { id: 'doctor-1', fullName: 'dr. Siti Rahayu', specialty: 'Umum' },
      ...overrides,
    };
  }

  function buildTool(
    listSessionsCalendar: jest.Mock,
    env: Record<string, string> = { CLINIC_TIMEZONE: 'Asia/Jakarta' },
  ): GetAppointmentLoadTool {
    return new GetAppointmentLoadTool(
      { listSessionsCalendar } as unknown as AppointmentManagementService,
      new ConfigService(env),
    );
  }

  it('declares the permission the backing service actually asserts', () => {
    // §2.1.2's table said `appointment.read:any`, but listSessionsCalendar
    // asserts `AppointmentSession:read` — the same class of error the two
    // pharmacy rows had, and the same fix: declare what the route opens.
    expect(buildTool(jest.fn()).requiredPermission).toEqual({
      resource: 'AppointmentSession',
      action: 'read',
      scope: 'ANY',
    });
  });

  it('defaults both ends of the window to today in the clinic timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T20:00:00.000Z'));
    const mockListSessionsCalendar = jest.fn().mockResolvedValue([]);

    const actualResult = await buildTool(mockListSessionsCalendar).execute(mockUser, {});

    // 20:00 UTC is already the 4th in Jakarta; a single-day question should
    // not require the model to repeat a date it may have derived wrongly.
    expect(actualResult).toMatchObject({ from: '2026-08-04', to: '2026-08-04' });
    expect(mockListSessionsCalendar).toHaveBeenCalledWith(
      { from: '2026-08-04', to: '2026-08-04' },
      mockUser,
    );
    jest.useRealTimers();
  });

  it('defaults `to` to `from` when only a start is given', async () => {
    const mockListSessionsCalendar = jest.fn().mockResolvedValue([]);

    const actualResult = await buildTool(mockListSessionsCalendar).execute(mockUser, {
      from: '2026-09-01',
    });

    expect(actualResult).toMatchObject({ from: '2026-09-01', to: '2026-09-01' });
  });

  it('projects capacity and drops every internal handle', async () => {
    const mockListSessionsCalendar = jest.fn().mockResolvedValue([buildSession()]);

    const actualResult = await buildTool(mockListSessionsCalendar).execute(mockUser, {
      from: '2026-08-03',
      to: '2026-08-03',
    });

    expect(actualResult.items).toEqual([
      {
        sessionDate: '2026-08-03',
        startTime: '08:00',
        endTime: '12:00',
        doctorName: 'dr. Siti Rahayu',
        specialty: 'Umum',
        status: 'OPEN',
        maxPatients: 20,
        bookedCount: 14,
        remaining: 6,
      },
    ]);
    const serialized = JSON.stringify(actualResult);
    expect(serialized).not.toContain('session-1');
    expect(serialized).not.toContain('schedule-1');
    expect(serialized).not.toContain('doctor-1');
  });

  it('totals the booked count across the window', async () => {
    const mockListSessionsCalendar = jest
      .fn()
      .mockResolvedValue([buildSession(), buildSession({ bookedCount: 9, remaining: 11 })]);

    const actualResult = await buildTool(mockListSessionsCalendar).execute(mockUser, {});

    expect(actualResult.sessionCount).toBe(2);
    expect(actualResult.totalBooked).toBe(23);
  });

  it('carries an unlimited session through as null rather than zero', async () => {
    const mockListSessionsCalendar = jest
      .fn()
      .mockResolvedValue([buildSession({ maxPatients: null, remaining: null })]);

    const actualResult = await buildTool(mockListSessionsCalendar).execute(mockUser, {});

    // "no cap" and "no room" are different operational facts.
    expect(actualResult.items[0]?.maxPatients).toBeNull();
    expect(actualResult.items[0]?.remaining).toBeNull();
  });

  it('never carries an attendee row, even if one appears upstream', async () => {
    const mockListSessionsCalendar = jest.fn().mockResolvedValue([
      buildSession({
        queue: [{ appointmentId: 'a-1', patient: { fullName: 'Budi Santoso', mrn: 'MRN42' } }],
      }),
    ]);

    const actualResult = await buildTool(mockListSessionsCalendar).execute(mockUser, {});

    expect(JSON.stringify(actualResult)).not.toContain('Budi Santoso');
    expect(JSON.stringify(actualResult)).not.toContain('MRN42');
  });

  it('lets the service’s range limit through unchanged', async () => {
    const mockListSessionsCalendar = jest
      .fn()
      .mockRejectedValue(new BadRequestException('Range exceeds the maximum'));

    await expect(
      buildTool(mockListSessionsCalendar).execute(mockUser, {
        from: '2026-01-01',
        to: '2026-12-31',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
