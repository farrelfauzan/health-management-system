import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppointmentManagementService } from '../appointment-management/service/appointment-management.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { RegistrationFlowRepository } from './repository/registration-flow.repository';

/**
 * P19-T16. Check-in is refused outside the doctor's practice window, and an
 * administrator holding `registration.checkin-override:any` may force it.
 *
 * The clock is frozen at instants chosen in Asia/Jakarta and expressed in UTC,
 * so the suite proves the same thing on a developer's Mac and on a UTC CI
 * runner: an 08:00 Jakarta session is reachable from either.
 */
describe('Registration check-in session window integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const registrationId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1b001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1b002';
  const appointmentId = '58e9a316-40b2-4f4c-9207-2a58028bb003';
  const doctorId = '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0bb004';
  const sessionId = 'a9d4c0f6-1b2e-4c7a-9d3f-1de1a005b005';

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const registrationRepositoryMock = {
    listRegistrations: jest.fn(),
    findRegistrationDetailById: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveAppointmentById: jest.fn(),
    findRegistrationByAppointmentId: jest.fn(),
    findOpenRegistrationByPatientId: jest.fn(),
    createRegistration: jest.fn(),
    updateRegistration: jest.fn(),
    listQueueBoard: jest.fn(),
  };

  const appointmentManagementServiceMock = {
    listDoctorPracticeWindows: jest.fn(),
  };

  const auditServiceMock = {
    record: jest.fn(),
    recordOrThrow: jest.fn(),
  };

  const prismaServiceMock = {
    // SJ-4 writes one audit row per patient-data route and awaits it, so the
    // delegate has to exist on this wholesale Prisma stub.
    auditLog: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  /** A booking that joined a 14:00-17:00 session on 18 July 2026. */
  const registrationRecord = {
    id: registrationId,
    patientId,
    appointmentId,
    type: 'CONSULTATION',
    status: 'PENDING',
    queueNumber: 1,
    queueDate: new Date('2026-07-18T00:00:00.000Z'),
    specialtyId: null,
    poliQueueNumber: null,
    registeredAt: new Date('2026-07-18T01:00:00.000Z'),
    checkedInAt: null,
    completedAt: null,
    createdById: null,
    createdAt: new Date('2026-07-18T01:00:00.000Z'),
    updatedAt: new Date('2026-07-18T01:00:00.000Z'),
    patient: {
      id: patientId,
      mrn: 'MRN-0001',
      fullName: 'Patient One',
      ownerUserId: null,
    },
    appointment: {
      id: appointmentId,
      type: 'SESSION',
      doctorId,
      scheduledAt: new Date('2026-07-18T07:00:00.000Z'),
      status: 'SCHEDULED',
      doctor: {
        id: doctorId,
        fullName: 'dr. Ayu',
        specialty: { name: 'Poli Umum' },
      },
      session: {
        id: sessionId,
        sessionDate: new Date('2026-07-18T00:00:00.000Z'),
        startTime: '14:00',
        endTime: '17:00',
      },
    },
    specialty: null,
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'desk-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: permissions.map((permission) => ({ permission })),
          },
        },
      ],
    });
  }

  const DESK_PERMISSIONS = [
    { action: 'update', resource: 'Registration', scope: 'ANY' as const },
  ];
  const OVERRIDE_PERMISSIONS = [
    ...DESK_PERMISSIONS,
    { action: 'checkin-override', resource: 'Registration', scope: 'ANY' as const },
  ];

  function freezeClinicClock(instant: string): void {
    jest.useFakeTimers({
      // Nest and supertest both schedule work; only the wall clock is faked.
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setInterval',
        'setTimeout',
        'clearInterval',
        'clearTimeout',
        'queueMicrotask',
      ],
      now: new Date(instant),
    });
  }

  function checkIn(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/v1/v1/registrations/${registrationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(RegistrationFlowRepository)
      .useValue(registrationRepositoryMock)
      .overrideProvider(AppointmentManagementService)
      .useValue(appointmentManagementServiceMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    appointmentManagementServiceMock.listDoctorPracticeWindows.mockResolvedValue([]);
    registrationRepositoryMock.findRegistrationDetailById.mockResolvedValue(registrationRecord);
    registrationRepositoryMock.updateRegistration.mockResolvedValue({
      ...registrationRecord,
      status: 'CHECKED_IN',
      checkedInAt: new Date('2026-07-18T08:00:00.000Z'),
    });
  });

  it('checks a patient in inside the session window', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(DESK_PERMISSIONS);
    // 15:00 Asia/Jakarta.
    freezeClinicClock('2026-07-18T08:00:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CHECKED_IN');
    expect(response.body.data.todaySession).toEqual({
      start: '14:00',
      end: '17:00',
      opensAt: '13:00',
      closesAt: '17:00',
    });
  });

  it('refuses a check-in before the grace opens and names the opening time', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(DESK_PERMISSIONS);
    // 12:30 Asia/Jakarta, half an hour before check-in opens.
    freezeClinicClock('2026-07-18T05:30:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REGISTRATION_OUTSIDE_SESSION');
    expect(response.body.error.message).toContain('check-in opens at 13:00');
    expect(response.body.error.details).toEqual(
      expect.objectContaining({
        doctorName: 'dr. Ayu',
        reason: 'BEFORE_OPENING',
        sessionStart: '14:00',
        sessionEnd: '17:00',
        opensAt: '13:00',
      }),
    );
    expect(registrationRepositoryMock.updateRegistration).not.toHaveBeenCalled();
  });

  it('refuses a check-in after the session ended', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(DESK_PERMISSIONS);
    // 17:30 Asia/Jakarta.
    freezeClinicClock('2026-07-18T10:30:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN' });

    expect(response.status).toBe(409);
    expect(response.body.error.details.reason).toBe('AFTER_END');
  });

  it('refuses a check-in on a day the doctor holds no session', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(DESK_PERMISSIONS);
    registrationRepositoryMock.findRegistrationDetailById.mockResolvedValue({
      ...registrationRecord,
      appointment: { ...registrationRecord.appointment, session: null },
    });
    freezeClinicClock('2026-07-18T08:00:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN' });

    expect(response.status).toBe(409);
    expect(response.body.error.details.reason).toBe('NO_SESSION');
    expect(response.body.error.message).toContain('no session today');
  });

  it('forbids force from a caller without the override permission', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(DESK_PERMISSIONS);
    freezeClinicClock('2026-07-18T05:30:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN', force: true });

    expect(response.status).toBe(403);
    expect(registrationRepositoryMock.updateRegistration).not.toHaveBeenCalled();
  });

  it('lets an override-holder force the check-in, and audits it', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(OVERRIDE_PERMISSIONS);
    freezeClinicClock('2026-07-18T05:30:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN', force: true });

    expect(response.status).toBe(200);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REGISTRATION_CHECKIN_OVERRIDDEN',
        resourceId: registrationId,
        patientId,
      }),
    );
  });

  it('leaves a LAB_ONLY walk-in unaffected by the rule', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(DESK_PERMISSIONS);
    registrationRepositoryMock.findRegistrationDetailById.mockResolvedValue({
      ...registrationRecord,
      type: 'LAB_ONLY',
      appointmentId: null,
      appointment: null,
    });
    // 03:00 Asia/Jakarta, nowhere near any session.
    freezeClinicClock('2026-07-17T20:00:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN' });

    expect(response.status).toBe(200);
    expect(registrationRepositoryMock.updateRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CHECKED_IN' }),
    );
  });

  it('honours an 08:00 Asia/Jakarta session from a UTC runner', async () => {
    const token = await buildToken('desk-user', 'desk@hms.local');
    mockActorWithPermissions(DESK_PERMISSIONS);
    registrationRepositoryMock.findRegistrationDetailById.mockResolvedValue({
      ...registrationRecord,
      appointment: {
        ...registrationRecord.appointment,
        session: {
          ...registrationRecord.appointment.session,
          startTime: '08:00',
          endTime: '11:00',
        },
      },
    });
    // 01:30 UTC is 08:30 in Jakarta: inside the session, and on a naive UTC
    // comparison would read as seven hours before it opened.
    freezeClinicClock('2026-07-18T01:30:00.000Z');

    const response = await checkIn(token, { status: 'CHECKED_IN' });

    expect(response.status).toBe(200);
  });
});
