import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { NotificationService } from '../../notification/service/notification.service';
import { AppointmentManagementRepository } from '../repository/appointment-management.repository';
import { AppointmentSessionChangeRepository } from '../repository/appointment-session-change.repository';
import { AppointmentSessionChangeService } from './appointment-session-change.service';

const DAY_IN_MS = 86_400_000;
const sessionId = '7b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41';
const currentUser = { sub: 'admin-user', email: 'admin@spec.local' };

function buildActor(scope: 'ANY' | 'OWN') {
  return {
    roles: [
      {
        role: {
          permissions: [
            { permission: { resource: 'AppointmentSession', action: 'update', scope } },
          ],
        },
      },
    ],
  };
}

function buildSession(sessionDate: string) {
  return {
    id: sessionId,
    doctorId: 'doctor-1',
    scheduleId: 'schedule-1',
    sessionDate: new Date(`${sessionDate}T00:00:00.000Z`),
    startTime: '08:00',
    endTime: '10:00',
    maxPatients: null,
    status: 'OPEN',
    statusReason: null,
    movedToSessionId: null,
    movedTo: null,
    _count: { appointments: 0 },
  };
}

describe('AppointmentSessionChangeService', () => {
  const authRepositoryMock = { findUserById: jest.fn() };
  const appointmentRepositoryMock = { findSessionWithCountById: jest.fn() };
  const changeRepositoryMock = {
    findTargetDayWindows: jest.fn(),
    moveSession: jest.fn(),
    cancelSession: jest.fn(),
  };
  const notificationServiceMock = { createForUsers: jest.fn() };
  const futureDate = new Date(Date.now() + 14 * DAY_IN_MS).toISOString().slice(0, 10);
  let service: AppointmentSessionChangeService;

  beforeEach(() => {
    jest.clearAllMocks();
    authRepositoryMock.findUserById.mockResolvedValue(buildActor('ANY'));
    appointmentRepositoryMock.findSessionWithCountById.mockResolvedValue(buildSession(futureDate));
    changeRepositoryMock.findTargetDayWindows.mockResolvedValue({ sessions: [], schedules: [] });
    service = new AppointmentSessionChangeService(
      appointmentRepositoryMock as unknown as AppointmentManagementRepository,
      changeRepositoryMock as unknown as AppointmentSessionChangeRepository,
      authRepositoryMock as unknown as AuthRepository,
      notificationServiceMock as unknown as NotificationService,
      new ConfigService(),
    );
  });

  it('refuses a doctor holding only the own-scope grant', async () => {
    authRepositoryMock.findUserById.mockResolvedValue(buildActor('OWN'));
    await expect(
      service.cancelSession(sessionId, { reason: 'Dokter sakit' }, currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(changeRepositoryMock.cancelSession).not.toHaveBeenCalled();
  });

  it('refuses a move that keeps the same start on the same day', async () => {
    await expect(
      service.rescheduleSession(
        sessionId,
        { sessionDate: futureDate, startTime: '08:00', endTime: '11:00', reason: 'Perpanjang' },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a move into a window that is already over', async () => {
    const pastDate = new Date(Date.now() - 2 * DAY_IN_MS).toISOString().slice(0, 10);
    appointmentRepositoryMock.findSessionWithCountById.mockResolvedValue(buildSession(pastDate));
    await expect(
      service.rescheduleSession(
        sessionId,
        { sessionDate: pastDate, startTime: '13:00', endTime: '15:00', reason: 'Terlambat' },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a moved session', async () => {
    appointmentRepositoryMock.findSessionWithCountById.mockResolvedValue({
      ...buildSession(futureDate),
      status: 'MOVED',
    });
    await expect(
      service.rescheduleSession(
        sessionId,
        { sessionDate: futureDate, startTime: '13:00', endTime: '15:00', reason: 'Lagi' },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an overlap with a live session that day', async () => {
    changeRepositoryMock.findTargetDayWindows.mockResolvedValue({
      sessions: [{ id: 'other', startTime: '14:00', endTime: '16:00', status: 'OPEN' }],
      schedules: [],
    });
    await expect(
      service.rescheduleSession(
        sessionId,
        { sessionDate: futureDate, startTime: '13:00', endTime: '15:00', reason: 'Bentrok' },
        currentUser,
      ),
    ).rejects.toThrow('14:00–16:00');
    expect(changeRepositoryMock.moveSession).not.toHaveBeenCalled();
  });

  it('still reports the move when the patient notification fails', async () => {
    changeRepositoryMock.moveSession.mockResolvedValue({
      outcome: 'MOVED',
      targetSessionId: 'target-1',
      doctorName: 'Dr A',
      moved: [{ appointmentId: 'appt-1', recipientUserId: 'patient-user' }],
      blocked: [],
    });
    notificationServiceMock.createForUsers.mockRejectedValue(new Error('bell down'));
    const actualResult = await service.rescheduleSession(
      sessionId,
      { sessionDate: futureDate, startTime: '13:00', endTime: '15:00', reason: 'Terlambat' },
      currentUser,
    );
    expect(actualResult.movedCount).toBe(1);
  });
});
