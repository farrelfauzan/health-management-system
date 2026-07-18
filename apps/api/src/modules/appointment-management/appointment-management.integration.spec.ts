import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { AppointmentManagementRepository } from './repository/appointment-management.repository';

describe('AppointmentManagement integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const appointmentId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const futureScheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const appointmentRepositoryMock = {
    listAppointments: jest.fn(),
    findAppointmentDetailById: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findConflictingAppointment: jest.fn(),
    createAppointment: jest.fn(),
    updateAppointment: jest.fn(),
    cancelAppointment: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const appointmentRecord = {
    id: appointmentId,
    patientId,
    doctorId,
    scheduledAt: new Date(futureScheduledAt),
    status: 'SCHEDULED',
    reason: 'Routine check',
    notes: null,
    createdById: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    patient: {
      id: patientId,
      mrn: 'MRN-0001',
      fullName: 'Patient One',
      ownerUserId: null,
    },
    doctor: {
      id: doctorId,
      fullName: 'Dr. First',
      specialty: 'Cardiology',
      ownerUserId: null,
    },
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
      .overrideProvider(AppointmentManagementRepository)
      .useValue(appointmentRepositoryMock)
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
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    appointmentRepositoryMock.listAppointments.mockResolvedValue({
      items: [appointmentRecord],
      total: 1,
      page: 1,
      limit: 10,
    });
    appointmentRepositoryMock.findAppointmentDetailById.mockResolvedValue(appointmentRecord);
    appointmentRepositoryMock.findActivePatientById.mockResolvedValue({
      id: patientId,
      ownerUserId: null,
    });
    appointmentRepositoryMock.findActiveDoctorById.mockResolvedValue({
      id: doctorId,
      ownerUserId: null,
      schedules: [],
    });
    appointmentRepositoryMock.findConflictingAppointment.mockResolvedValue(null);
    appointmentRepositoryMock.createAppointment.mockResolvedValue(appointmentRecord);
    appointmentRepositoryMock.updateAppointment.mockResolvedValue(appointmentRecord);
    appointmentRepositoryMock.cancelAppointment.mockResolvedValue({
      ...appointmentRecord,
      status: 'CANCELLED',
    });
  });

  it('returns 401 when bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/appointments');

    expect(response.status).toBe(401);
  });

  it('returns 403 when user lacks appointment.read permission', async () => {
    const token = await buildToken('no-read-user', 'no-read@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Patient', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/appointments')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 200 for appointment list with read:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/appointments')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(appointmentRepositoryMock.listAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: undefined }),
    );
  });

  it('scopes appointment list to the current user with read:own permission', async () => {
    const token = await buildToken('own-user', 'own@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Appointment', scope: 'OWN' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/appointments')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(appointmentRepositoryMock.listAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: 'own-user' }),
    );
  });

  it('returns 201 for appointment creation with create:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        doctorId,
        scheduledAt: futureScheduledAt,
        reason: 'Routine check',
      });

    expect(response.status).toBe(201);
    expect(appointmentRepositoryMock.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: 'admin-user' }),
    );
  });

  it('returns 403 for appointment creation without create permission', async () => {
    const token = await buildToken('reader-user', 'reader@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        doctorId,
        scheduledAt: futureScheduledAt,
      });

    expect(response.status).toBe(403);
    expect(appointmentRepositoryMock.createAppointment).not.toHaveBeenCalled();
  });

  it('returns 400 for appointment creation with invalid payload', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        scheduledAt: 'not-a-date',
      });

    expect(response.status).toBe(400);
    expect(appointmentRepositoryMock.createAppointment).not.toHaveBeenCalled();
  });

  it('returns 200 for appointment update with update:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'update', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'CONFIRMED',
      });

    expect(response.status).toBe(200);
    expect(appointmentRepositoryMock.updateAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED' }),
    );
  });

  it('returns 403 for appointment update without update permission', async () => {
    const token = await buildToken('reader-user', 'reader@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'CONFIRMED',
      });

    expect(response.status).toBe(403);
    expect(appointmentRepositoryMock.updateAppointment).not.toHaveBeenCalled();
  });

  it('returns 200 for appointment cancel with cancel:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Patient request',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
    expect(appointmentRepositoryMock.cancelAppointment).toHaveBeenCalledWith({
      id: appointmentId,
      notes: 'Cancellation reason: Patient request',
    });
  });

  it('returns 403 for appointment cancel without cancel permission', async () => {
    const token = await buildToken('reader-user', 'reader@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Appointment', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(403);
    expect(appointmentRepositoryMock.cancelAppointment).not.toHaveBeenCalled();
  });
});
