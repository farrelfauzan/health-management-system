import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { RegistrationFlowRepository } from './repository/registration-flow.repository';

describe('RegistrationFlow integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const registrationId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11';
  const specialtyId = '2f5c7a30-1b4e-4a7d-9f1c-1de1a0040001';

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

  const prismaServiceMock = {
    // SJ-4 writes one audit row per patient-data route, and the write is
    // awaited: an access that cannot be recorded fails the request rather than
    // returning the data. This stub replaces Prisma wholesale, so the delegate
    // has to exist here or every audited route in this suite answers 500.
    auditLog: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const registrationRecord = {
    id: registrationId,
    patientId,
    appointmentId: null,
    status: 'PENDING',
    queueNumber: 1,
    queueDate: new Date('2026-07-18T00:00:00.000Z'),
    specialtyId: null,
    poliQueueNumber: null,
    registeredAt: new Date('2026-07-18T08:00:00.000Z'),
    checkedInAt: null,
    completedAt: null,
    createdById: null,
    createdAt: new Date('2026-07-18T08:00:00.000Z'),
    updatedAt: new Date('2026-07-18T08:00:00.000Z'),
    patient: {
      id: patientId,
      mrn: 'MRN-0001',
      fullName: 'Patient One',
      ownerUserId: null,
    },
    appointment: null,
    specialty: null,
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync(
      {
        sub,
        email,
      },
      {
        secret: 'dev-access-secret',
      },
    );
  }

  function mockActorWithPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(RegistrationFlowRepository)
      .useValue(registrationRepositoryMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({
      defaultVersion: '1',
      prefix: 'v',
      type: VersioningType.URI,
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    registrationRepositoryMock.listRegistrations.mockResolvedValue({
      items: [registrationRecord],
      total: 1,
      page: 1,
      limit: 10,
    });
    registrationRepositoryMock.findRegistrationDetailById.mockResolvedValue(registrationRecord);
    registrationRepositoryMock.findActivePatientById.mockResolvedValue({
      id: patientId,
      ownerUserId: null,
    });
    registrationRepositoryMock.findActiveAppointmentById.mockResolvedValue(null);
    registrationRepositoryMock.findRegistrationByAppointmentId.mockResolvedValue(null);
    registrationRepositoryMock.findOpenRegistrationByPatientId.mockResolvedValue(null);
    registrationRepositoryMock.createRegistration.mockResolvedValue(registrationRecord);
    registrationRepositoryMock.updateRegistration.mockResolvedValue({
      ...registrationRecord,
      status: 'CHECKED_IN',
      checkedInAt: new Date('2026-07-18T09:00:00.000Z'),
    });
    registrationRepositoryMock.listQueueBoard.mockResolvedValue([registrationRecord]);
  });

  it('returns 401 when bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/registrations');

    expect(response.status).toBe(401);
  });

  it('returns 403 when user lacks registration.read permission', async () => {
    const token = await buildToken('no-read-user', 'no-read@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Patient', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 200 for registration list with read:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(registrationRepositoryMock.listRegistrations).toHaveBeenCalledWith(
      expect.any(Object),
      { userId: 'admin-user', scope: 'ANY' },
    );
  });

  it('scopes registration list to the current user with read:own permission', async () => {
    const token = await buildToken('own-user', 'own@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(registrationRepositoryMock.listRegistrations).toHaveBeenCalledWith(
      expect.any(Object),
      { userId: 'own-user', scope: 'OWN' },
    );
  });

  it('passes search and calendar-date filters through the registration list query', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations')
      .query({ search: 'MRN-0001', registeredFrom: '2026-07-01', registeredTo: '2026-07-18' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(registrationRepositoryMock.listRegistrations).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'MRN-0001',
        registeredFrom: new Date('2026-07-01T00:00:00.000Z'),
        registeredTo: new Date('2026-07-18T00:00:00.000Z'),
      }),
      expect.any(Object),
    );
  });

  it('passes the doctor filter through the registration list query', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations')
      .query({ doctorId })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(registrationRepositoryMock.listRegistrations).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId }),
      expect.any(Object),
    );
  });

  it('returns 400 for a registration list query with a non-uuid doctor filter', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations')
      .query({ doctorId: 'not-a-uuid' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(registrationRepositoryMock.listRegistrations).not.toHaveBeenCalled();
  });

  it('returns 400 for a registration list query with an invalid calendar date', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations')
      .query({ registeredFrom: '2026-02-30' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(registrationRepositoryMock.listRegistrations).not.toHaveBeenCalled();
  });

  it('returns 200 for the queue board with read:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations/queue-board')
      .query({ date: '2026-07-18' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe('2026-07-18');
    expect(response.body.data.entries).toHaveLength(1);
    expect(response.body.data.entries[0].queueNumber).toBe(1);
    expect(response.body.data.counts.pending).toBe(1);
    expect(registrationRepositoryMock.listQueueBoard).toHaveBeenCalledWith({
      queueDate: new Date('2026-07-18T00:00:00.000Z'),
    });
  });

  it('returns 403 for the queue board with only read:own permission', async () => {
    const token = await buildToken('own-user', 'own@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations/queue-board')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(registrationRepositoryMock.listQueueBoard).not.toHaveBeenCalled();
  });

  it('returns 400 for a queue board query with an invalid calendar date', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations/queue-board')
      .query({ date: '2026-02-30' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(registrationRepositoryMock.listQueueBoard).not.toHaveBeenCalled();
  });

  it('returns the per-poli ticket and summary on the queue board', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
    registrationRepositoryMock.listQueueBoard.mockResolvedValue([
      {
        ...registrationRecord,
        specialtyId,
        poliQueueNumber: 1,
        specialty: { id: specialtyId, name: 'Poli Umum' },
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations/queue-board')
      .query({ date: '2026-07-18', specialtyId })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.entries[0].queueNumber).toBe(1);
    expect(response.body.data.entries[0].poliQueueNumber).toBe(1);
    expect(response.body.data.entries[0].poli).toEqual({ id: specialtyId, name: 'Poli Umum' });
    expect(response.body.data.poli).toEqual([
      {
        poli: { id: specialtyId, name: 'Poli Umum' },
        waiting: 1,
        counts: { pending: 1, checkedIn: 0, completed: 0, cancelled: 0 },
        lastIssuedNumber: 1,
      },
    ]);
    expect(registrationRepositoryMock.listQueueBoard).toHaveBeenCalledWith({
      queueDate: new Date('2026-07-18T00:00:00.000Z'),
      specialtyId,
    });
  });

  it('returns 400 for a queue board query with a non-uuid poli filter', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/registrations/queue-board')
      .query({ specialtyId: 'poli-umum' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(registrationRepositoryMock.listQueueBoard).not.toHaveBeenCalled();
  });

  it('returns 201 for registration creation with create:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
      });

    expect(response.status).toBe(201);
    expect(registrationRepositoryMock.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: 'admin-user' }),
    );
  });

  it('returns 403 for registration creation without create permission', async () => {
    const token = await buildToken('reader-user', 'reader@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
      });

    expect(response.status).toBe(403);
    expect(registrationRepositoryMock.createRegistration).not.toHaveBeenCalled();
  });

  it('returns 403 for create:own registration targeting an unowned patient', async () => {
    const token = await buildToken('own-user', 'own@hms.local');
    mockActorWithPermissions([{ action: 'create', resource: 'Registration', scope: 'OWN' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
      });

    expect(response.status).toBe(403);
    expect(registrationRepositoryMock.createRegistration).not.toHaveBeenCalled();
  });

  it('returns 400 for registration creation with invalid payload', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId: 'not-a-uuid',
      });

    expect(response.status).toBe(400);
    expect(registrationRepositoryMock.createRegistration).not.toHaveBeenCalled();
  });

  it('returns 200 for registration status update with update:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/registrations/${registrationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'CHECKED_IN',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CHECKED_IN');
    expect(registrationRepositoryMock.updateRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CHECKED_IN' }),
    );
  });

  it('returns 403 for registration update without update permission', async () => {
    const token = await buildToken('reader-user', 'reader@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/registrations/${registrationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'CHECKED_IN',
      });

    expect(response.status).toBe(403);
    expect(registrationRepositoryMock.updateRegistration).not.toHaveBeenCalled();
  });

  it('returns 403 when an owning patient tries to check in their registration', async () => {
    const token = await buildToken('own-user', 'own@hms.local');
    mockActorWithPermissions([{ action: 'update', resource: 'Registration', scope: 'OWN' }]);
    registrationRepositoryMock.findRegistrationDetailById.mockResolvedValue({
      ...registrationRecord,
      patient: { ...registrationRecord.patient, ownerUserId: 'own-user' },
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/registrations/${registrationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'CHECKED_IN',
      });

    expect(response.status).toBe(403);
    expect(registrationRepositoryMock.updateRegistration).not.toHaveBeenCalled();
  });

  it('returns 200 when an owning patient cancels their pending registration', async () => {
    const token = await buildToken('own-user', 'own@hms.local');
    mockActorWithPermissions([{ action: 'update', resource: 'Registration', scope: 'OWN' }]);
    registrationRepositoryMock.findRegistrationDetailById.mockResolvedValue({
      ...registrationRecord,
      patient: { ...registrationRecord.patient, ownerUserId: 'own-user' },
    });
    registrationRepositoryMock.updateRegistration.mockResolvedValue({
      ...registrationRecord,
      status: 'CANCELLED',
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/registrations/${registrationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'CANCELLED',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
  });
});
