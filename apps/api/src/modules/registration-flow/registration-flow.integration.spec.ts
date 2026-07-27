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
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const registrationRecord = {
    id: registrationId,
    patientId,
    appointmentId: null,
    status: 'PENDING',
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
      expect.objectContaining({ ownerUserId: undefined }),
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
      expect.objectContaining({ ownerUserId: 'own-user' }),
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
