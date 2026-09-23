import { buildZonedDateTime } from '@hms/shared-types';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../common/auth/current-user.type';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DoctorLicenseExpiryService } from '../doctor-management/service/doctor-license-expiry.service';
import { DoctorPatientService } from '../doctor-patient/service/doctor-patient.service';
import { NotificationService } from '../notification/service/notification.service';
import { AppointmentManagementRepository } from './repository/appointment-management.repository';
import { AppointmentSessionChangeRepository } from './repository/appointment-session-change.repository';
import { AppointmentManagementService } from './service/appointment-management.service';
import { AppointmentSessionChangeService } from './service/appointment-session-change.service';

const DAY_IN_MS = 86_400_000;
const WEEK_IN_DAYS = 7;
const MONDAY = 1;
const WEDNESDAY = 3;
const THURSDAY = 4;

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_IN_MS)
    .toISOString()
    .slice(0, 10);
}

function itemAt<TItem>(items: readonly TItem[], index: number): TItem {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Fixture is missing item ${index}`);
  }
  return item;
}

/** The Monday at least two weeks out, so every window in the spec is in the future. */
function findFutureMonday(): string {
  const start = new Date(Date.now() + 2 * WEEK_IN_DAYS * DAY_IN_MS).toISOString().slice(0, 10);
  const daysUntilMonday = (MONDAY - new Date(`${start}T00:00:00.000Z`).getUTCDay() + 7) % 7;
  return addDays(start, daysUntilMonday);
}

/**
 * P28 against Postgres: moving a practice-session occurrence within its week,
 * and cancelling one. Only the database can prove the properties that matter
 * here — the tombstone that keeps the original slot closed, the booking that
 * lands in the replacement, the row lock that lets exactly one of two
 * concurrent moves through, and queue numbers that survive the move under the
 * `(session_id, queue_number)` unique key.
 */
describe('Appointment session change against Postgres', () => {
  let prisma: PrismaService;
  let appointmentService: AppointmentManagementService;
  let sessionChangeService: AppointmentSessionChangeService;
  let currentUser: CurrentUser;
  let clinicTimeZone: string;

  const seedSuffix = `p28-${Date.now()}`;
  const weekA = findFutureMonday();
  const weekB = addDays(weekA, WEEK_IN_DAYS);
  const seededUserIds: string[] = [];
  const seededPatientIds: string[] = [];
  let seededSpecialtyId: string;
  let doctorId: string;
  let mondayWindowId: string;
  let wednesdayWindowId: string;
  let thursdayWindowId: string;
  let patientOwnerUserId: string;
  const notificationServiceMock = { createForUsers: jest.fn().mockResolvedValue(1) };

  beforeAll(async () => {
    const configService = new ConfigService();
    clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? 'Asia/Jakarta';
    prisma = new PrismaService(configService);
    await prisma.$connect();
    const [adminUser, patientOwner] = await Promise.all([
      prisma.user.create({ data: { email: `admin-${seedSuffix}@spec.local`, passwordHash: 'x' } }),
      prisma.user.create({ data: { email: `owner-${seedSuffix}@spec.local`, passwordHash: 'x' } }),
    ]);
    seededUserIds.push(adminUser.id, patientOwner.id);
    patientOwnerUserId = patientOwner.id;
    currentUser = { sub: adminUser.id, email: adminUser.email };
    const specialty = await prisma.specialty.create({
      data: { name: `Session Change Spec ${seedSuffix}` },
    });
    seededSpecialtyId = specialty.id;
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `LIC-${seedSuffix}`,
        fullName: 'Dr Session Change Spec',
        specialtyId: specialty.id,
      },
    });
    doctorId = doctor.id;
    const windows = await Promise.all(
      [MONDAY, WEDNESDAY, THURSDAY].map((dayOfWeek) =>
        prisma.doctorSchedule.create({
          data: { doctorId, dayOfWeek, startTime: '08:00', endTime: '10:00' },
        }),
      ),
    );
    mondayWindowId = itemAt(windows, 0).id;
    wednesdayWindowId = itemAt(windows, 1).id;
    thursdayWindowId = itemAt(windows, 2).id;
    const adminActor = {
      roles: [
        {
          role: {
            permissions: [
              { resource: 'AppointmentSession', action: 'update', scope: 'ANY' },
              { resource: 'AppointmentSession', action: 'read', scope: 'ANY' },
              { resource: 'Appointment', action: 'create', scope: 'ANY' },
              { resource: 'Appointment', action: 'read', scope: 'ANY' },
            ].map((permission) => ({ permission })),
          },
        },
      ],
    };
    const authRepositoryStub = {
      findUserById: jest.fn().mockResolvedValue(adminActor),
    } as unknown as AuthRepository;
    const notificationStub = notificationServiceMock as unknown as NotificationService;
    const appointmentRepository = new AppointmentManagementRepository(prisma);
    appointmentService = new AppointmentManagementService(
      appointmentRepository,
      authRepositoryStub,
      { assignDoctorToPatient: jest.fn() } as unknown as DoctorPatientService,
      {
        findExpiredLicensesByDoctor: jest.fn().mockResolvedValue(new Map()),
      } as unknown as DoctorLicenseExpiryService,
      notificationStub,
      configService,
    );
    sessionChangeService = new AppointmentSessionChangeService(
      appointmentRepository,
      new AppointmentSessionChangeRepository(prisma),
      authRepositoryStub,
      notificationStub,
      configService,
    );
  });

  afterAll(async () => {
    const sessions = await prisma.appointmentSession.findMany({
      where: { doctorId },
      select: { id: true },
    });
    const sessionIds = sessions.map((session) => session.id);
    await prisma.appointmentSessionChange.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.registration.deleteMany({ where: { patientId: { in: seededPatientIds } } });
    await prisma.appointment.deleteMany({ where: { doctorId } });
    await prisma.appointmentSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { movedToSessionId: null },
    });
    await prisma.appointmentSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: seededSpecialtyId } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: seededPatientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    notificationServiceMock.createForUsers.mockClear();
  });

  async function createPatient(label: string, ownerUserId?: string): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        address: 'Jl. Uji Coba No. 1',
        mrn: `MRN-${seedSuffix}-${label}`,
        fullName: `Patient ${label}`,
        phoneNumber: '0800000001',
        ownerUserId,
      },
    });
    seededPatientIds.push(patient.id);
    return patient.id;
  }

  async function book(params: {
    patientId: string;
    scheduleId: string;
    sessionDate: string;
  }): Promise<{ id: string; sessionId: string | null; queueNumber: number | null }> {
    const booking = await appointmentService.createAppointment(
      { type: 'SESSION', doctorId, ...params },
      currentUser,
    );
    return prisma.appointment.findUniqueOrThrow({
      where: { id: booking.id },
      select: { id: true, sessionId: true, queueNumber: true },
    });
  }

  function atClinicTime(date: string, time: string): Date {
    return buildZonedDateTime({ date, time, timeZone: clinicTimeZone });
  }

  describe('Given Monday 08:00 with three bookings — one checked in, one from BPJS', () => {
    let sourceSessionId: string;
    let bookingIds: string[];
    let targetSessionId: string;

    beforeAll(async () => {
      const [ownedPatient, checkedInPatient, bpjsPatient] = await Promise.all([
        createPatient('A1', patientOwnerUserId),
        createPatient('A2'),
        createPatient('A3'),
      ]);
      const bookings = [];
      for (const patientId of [ownedPatient, checkedInPatient, bpjsPatient]) {
        bookings.push(await book({ patientId, scheduleId: mondayWindowId, sessionDate: weekA }));
      }
      bookingIds = bookings.map((booking) => booking.id);
      sourceSessionId = itemAt(bookings, 0).sessionId ?? '';
      await prisma.registration.create({
        data: {
          patientId: checkedInPatient,
          appointmentId: itemAt(bookings, 1).id,
          status: 'CHECKED_IN',
        },
      });
      await prisma.appointment.update({
        where: { id: itemAt(bookings, 2).id },
        data: { bpjsBookingCode: `BPJS-${seedSuffix}` },
      });
    });

    it('When moved later the same day, then everyone follows with their queue numbers', async () => {
      const actualResult = await sessionChangeService.rescheduleSession(
        sourceSessionId,
        { sessionDate: weekA, startTime: '13:00', endTime: '15:00', reason: 'Dokter terlambat' },
        currentUser,
      );
      targetSessionId = actualResult.target.id;
      const actualBookings = await prisma.appointment.findMany({
        where: { id: { in: bookingIds } },
        select: { sessionId: true, queueNumber: true, scheduledAt: true, status: true },
        orderBy: { queueNumber: 'asc' },
      });
      expect(actualResult.movedCount).toBe(3);
      expect(actualResult.blocked).toEqual([]);
      expect(actualResult.source).toMatchObject({
        status: 'MOVED',
        movedToSessionId: targetSessionId,
        statusReason: 'Dokter terlambat',
      });
      expect(actualBookings).toEqual(
        [1, 2, 3].map((queueNumber) => ({
          sessionId: targetSessionId,
          queueNumber,
          scheduledAt: atClinicTime(weekA, '13:00'),
          status: 'SCHEDULED',
        })),
      );
      expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(
        [patientOwnerUserId],
        expect.objectContaining({ type: 'APPOINTMENT_RESCHEDULED' }),
      );
    });

    it('Then the history records the move', async () => {
      const actualChanges = await prisma.appointmentSessionChange.findMany({
        where: { sessionId: sourceSessionId },
        select: { kind: true, targetSessionId: true, movedCount: true, blockedCount: true },
      });
      expect(actualChanges).toEqual([
        { kind: 'MOVED', targetSessionId, movedCount: 3, blockedCount: 0 },
      ]);
    });

    it('Then the calendar shows the original once as MOVED and next week as usual', async () => {
      const actualSessions = await appointmentService.listDoctorSessions(
        doctorId,
        { from: weekA, to: weekB },
        currentUser,
      );
      const mondays = actualSessions
        .filter((session) => session.sessionDate === weekA || session.sessionDate === weekB)
        .map((session) => ({
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          status: session.status,
          movedTo: session.movedTo?.startTime,
        }));
      expect(mondays).toEqual([
        { sessionDate: weekA, startTime: '08:00', status: 'MOVED', movedTo: '13:00' },
        { sessionDate: weekA, startTime: '13:00', status: 'OPEN', movedTo: undefined },
        { sessionDate: weekB, startTime: '08:00', status: 'OPEN', movedTo: undefined },
      ]);
    });

    it('Then a new booking for Monday lands in the 13:00 session', async () => {
      const latePatient = await createPatient('A4');
      const actualBooking = await book({
        patientId: latePatient,
        scheduleId: mondayWindowId,
        sessionDate: weekA,
      });
      expect(actualBooking).toMatchObject({ sessionId: targetSessionId, queueNumber: 4 });
    });

    it('Then check-in on Monday follows the 13:00 window only', async () => {
      const actualWindows = await appointmentService.listDoctorPracticeWindows({
        doctorIds: [doctorId],
        sessionDate: weekA,
      });
      expect(actualWindows.map((window) => [window.startTime, window.endTime])).toEqual([
        ['13:00', '15:00'],
      ]);
    });
  });

  describe('Given Wednesday 08:00 with three bookings — one registered, one from BPJS', () => {
    let sourceSessionId: string;
    let bookingIds: string[];

    beforeAll(async () => {
      const patients = await Promise.all([
        createPatient('W1'),
        createPatient('W2'),
        createPatient('W3'),
      ]);
      const bookings = [];
      for (const patientId of patients) {
        bookings.push(
          await book({ patientId, scheduleId: wednesdayWindowId, sessionDate: addDays(weekA, 2) }),
        );
      }
      bookingIds = bookings.map((booking) => booking.id);
      sourceSessionId = itemAt(bookings, 0).sessionId ?? '';
      await prisma.registration.create({
        data: {
          patientId: itemAt(patients, 1),
          appointmentId: itemAt(bookings, 1).id,
          status: 'PENDING',
        },
      });
      await prisma.appointment.update({
        where: { id: itemAt(bookings, 2).id },
        data: { bpjsBookingCode: `BPJS-W-${seedSuffix}` },
      });
    });

    it('When moved to Friday, then the registered and BPJS bookings stay behind', async () => {
      const friday = addDays(weekA, 4);
      const actualResult = await sessionChangeService.rescheduleSession(
        sourceSessionId,
        { sessionDate: friday, startTime: '13:00', endTime: '15:00', reason: 'Dokter seminar' },
        currentUser,
      );
      const actualStayed = await prisma.appointment.findMany({
        where: { id: { in: bookingIds }, sessionId: sourceSessionId },
        select: { id: true, status: true },
      });
      expect(actualResult.movedCount).toBe(1);
      expect(actualResult.blocked.map((entry) => [entry.appointmentId, entry.reason])).toEqual([
        [bookingIds[1], 'REGISTERED'],
        [bookingIds[2], 'BPJS_BOOKING'],
      ]);
      expect(actualStayed).toHaveLength(2);
      expect(actualStayed.every((booking) => booking.status === 'SCHEDULED')).toBe(true);
    });

    it('Then booking the moved occurrence by its window lands on Friday, and Wednesday is closed', async () => {
      const [fridayPatient, wednesdayPatient] = await Promise.all([
        createPatient('W4'),
        createPatient('W5'),
      ]);
      const actualFriday = await book({
        patientId: fridayPatient,
        scheduleId: wednesdayWindowId,
        sessionDate: addDays(weekA, 4),
      });
      const replacement = await prisma.appointmentSession.findUniqueOrThrow({
        where: { id: actualFriday.sessionId ?? '' },
        select: { startTime: true, sessionDate: true },
      });
      expect(replacement).toEqual({
        startTime: '13:00',
        sessionDate: new Date(`${addDays(weekA, 4)}T00:00:00.000Z`),
      });
      await expect(
        book({
          patientId: wednesdayPatient,
          scheduleId: wednesdayWindowId,
          sessionDate: addDays(weekA, 2),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('Given a week-B Monday session with two bookings', () => {
    let sessionId: string;

    beforeAll(async () => {
      const patients = await Promise.all([
        createPatient('B1'),
        createPatient('B2', patientOwnerUserId),
      ]);
      const bookings = [];
      for (const patientId of patients) {
        bookings.push(await book({ patientId, scheduleId: mondayWindowId, sessionDate: weekB }));
      }
      sessionId = itemAt(bookings, 0).sessionId ?? '';
    });

    it('When the target is in the next week, then it is refused', async () => {
      await expect(
        sessionChangeService.rescheduleSession(
          sessionId,
          {
            sessionDate: addDays(weekB, 7),
            startTime: '13:00',
            endTime: '15:00',
            reason: 'Salah minggu',
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("When the target overlaps Thursday's unbooked weekly window, then it is refused", async () => {
      await expect(
        sessionChangeService.rescheduleSession(
          sessionId,
          {
            sessionDate: addDays(weekB, 3),
            startTime: '09:00',
            endTime: '11:00',
            reason: 'Bentrok',
          },
          currentUser,
        ),
      ).rejects.toThrow('overlaps');
    });

    it('When the new capacity is below the bookings that move, then nothing changes', async () => {
      await expect(
        sessionChangeService.rescheduleSession(
          sessionId,
          {
            sessionDate: weekB,
            startTime: '13:00',
            endTime: '15:00',
            maxPatients: 1,
            reason: 'Kuota',
          },
          currentUser,
        ),
      ).rejects.toThrow('raise the capacity');
      const actualSession = await prisma.appointmentSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true },
      });
      expect(actualSession.status).toBe('OPEN');
    });

    it('When cancelled with a reason, then every booking is cancelled and the patient is told', async () => {
      const actualResult = await sessionChangeService.cancelSession(
        sessionId,
        { reason: 'Dokter sakit' },
        currentUser,
      );
      const actualStatuses = await prisma.appointment.findMany({
        where: { sessionId },
        select: { status: true },
      });
      expect(actualResult.cancelledCount).toBe(2);
      expect(actualResult.session).toMatchObject({
        status: 'CANCELLED',
        statusReason: 'Dokter sakit',
      });
      expect(actualStatuses).toEqual([{ status: 'CANCELLED' }, { status: 'CANCELLED' }]);
      expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(
        [patientOwnerUserId],
        expect.objectContaining({ type: 'APPOINTMENT_SESSION_CANCELLED' }),
      );
    });
  });

  describe('Given an unbooked week-B Thursday occurrence', () => {
    it('When materialised twice, then the same row comes back', async () => {
      const input = { scheduleId: thursdayWindowId, sessionDate: addDays(weekB, 3) };
      const first = await sessionChangeService.materializeSession(input, currentUser);
      const second = await sessionChangeService.materializeSession(input, currentUser);
      expect(second.id).toBe(first.id);
    });

    it('When two admins move it at once, then exactly one move happens', async () => {
      const thursday = addDays(weekB, 3);
      const session = await sessionChangeService.materializeSession(
        { scheduleId: thursdayWindowId, sessionDate: thursday },
        currentUser,
      );
      const actualOutcomes = await Promise.allSettled(
        ['13:00', '15:00'].map((startTime) =>
          sessionChangeService.rescheduleSession(
            session.id,
            {
              sessionDate: thursday,
              startTime,
              endTime: `${Number(startTime.slice(0, 2)) + 1}:00`,
              reason: 'Serentak',
            },
            currentUser,
          ),
        ),
      );
      const replacements = await prisma.appointmentSession.count({
        where: { doctorId, sessionDate: new Date(`${thursday}T00:00:00.000Z`), status: 'OPEN' },
      });
      expect(actualOutcomes.map((outcome) => outcome.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(replacements).toBe(1);
    });
  });
  describe('Given a week-C Wednesday moved onto Thursday afternoon', () => {
    it("Then check-in on Thursday accepts both the replacement and Thursday's own weekly window", async () => {
      const weekC = addDays(weekB, WEEK_IN_DAYS);
      const wednesday = addDays(weekC, 2);
      const thursday = addDays(weekC, 3);
      const session = await sessionChangeService.materializeSession(
        { scheduleId: wednesdayWindowId, sessionDate: wednesday },
        currentUser,
      );
      await sessionChangeService.rescheduleSession(
        session.id,
        { sessionDate: thursday, startTime: '13:00', endTime: '15:00', reason: 'Tukar hari' },
        currentUser,
      );
      const actualWindows = await appointmentService.listDoctorPracticeWindows({
        doctorIds: [doctorId],
        sessionDate: thursday,
      });
      expect(
        actualWindows
          .map((window) => `${window.startTime}-${window.endTime} ${window.source}`)
          .sort(),
      ).toEqual(['08:00-10:00 SCHEDULE', '13:00-15:00 SESSION']);
    });
  });
});
