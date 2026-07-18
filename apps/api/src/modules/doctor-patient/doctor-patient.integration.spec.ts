import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DoctorPatientRepository } from './repository/doctor-patient.repository';

describe('DoctorPatient integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const patientId = '3a6d785d-f729-4af2-b415-30f96439dad0';
  const assignmentId = '9c1a9c60-24a5-45ff-bc70-1a2f9d76a2f6';

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const doctorPatientRepositoryMock = {
    findActiveDoctorById: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveAssignment: jest.fn(),
    findAssignmentById: jest.fn(),
    createAssignment: jest.fn(),
    unassignAssignment: jest.fn(),
    listActivities: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
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
      .overrideProvider(DoctorPatientRepository)
      .useValue(doctorPatientRepositoryMock)
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

    doctorPatientRepositoryMock.findActiveDoctorById.mockResolvedValue({ id: doctorId });
    doctorPatientRepositoryMock.findActivePatientById.mockResolvedValue({ id: patientId });
    doctorPatientRepositoryMock.findActiveAssignment.mockResolvedValue(null);
    doctorPatientRepositoryMock.createAssignment.mockResolvedValue({
      id: assignmentId,
      doctorId,
      patientId,
      assignedById: 'actor-user',
      assignedAt: new Date('2026-07-01T00:00:00.000Z'),
      unassignedById: null,
      unassignedAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    doctorPatientRepositoryMock.listActivities.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
    });
  });

  it('returns 401 when bearer token is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-patient-assignments')
      .send({ doctorId, patientId });

    expect(response.status).toBe(401);
  });

  it('returns 403 when user lacks doctor-patient.assign permission', async () => {
    const token = await buildToken('no-assign-user', 'no-assign@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Patient', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-patient-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ doctorId, patientId });

    expect(response.status).toBe(403);
    expect(doctorPatientRepositoryMock.createAssignment).not.toHaveBeenCalled();
  });

  it('creates an assignment with assign:any permission', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'assign', resource: 'DoctorPatient', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-patient-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ doctorId, patientId });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: assignmentId,
        doctorId,
        patientId,
      }),
    );
    expect(doctorPatientRepositoryMock.createAssignment).toHaveBeenCalledWith({
      doctorId,
      patientId,
      actorUserId: 'actor-user',
    });
  });

  it('returns the active assignment without re-creating it', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'assign', resource: 'DoctorPatient', scope: 'ANY' }]);
    doctorPatientRepositoryMock.findActiveAssignment.mockResolvedValue({
      id: assignmentId,
      doctorId,
      patientId,
      assignedById: 'actor-user',
      assignedAt: new Date('2026-07-01T00:00:00.000Z'),
      unassignedById: null,
      unassignedAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-patient-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ doctorId, patientId });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Doctor already assigned to patient');
    expect(doctorPatientRepositoryMock.createAssignment).not.toHaveBeenCalled();
  });

  it('unassigns an active assignment with unassign:any permission', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'unassign', resource: 'DoctorPatient', scope: 'ANY' }]);
    doctorPatientRepositoryMock.findAssignmentById.mockResolvedValue({
      id: assignmentId,
      doctorId,
      patientId,
      assignedById: 'actor-user',
      assignedAt: new Date('2026-07-01T00:00:00.000Z'),
      unassignedById: null,
      unassignedAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    doctorPatientRepositoryMock.unassignAssignment.mockResolvedValue({
      id: assignmentId,
      doctorId,
      patientId,
      assignedById: 'actor-user',
      assignedAt: new Date('2026-07-01T00:00:00.000Z'),
      unassignedById: 'actor-user',
      unassignedAt: new Date('2026-07-15T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-15T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/v1/doctor-patient-assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.unassignedById).toBe('actor-user');
    expect(doctorPatientRepositoryMock.unassignAssignment).toHaveBeenCalledWith({
      assignmentId,
      actorUserId: 'actor-user',
    });
  });

  it('returns 403 for the activity log without activity.read permission', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'assign', resource: 'DoctorPatient', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/doctor-patient-assignments/activity')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(doctorPatientRepositoryMock.listActivities).not.toHaveBeenCalled();
  });

  it('returns activity events with activity.read:any permission', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([
      { action: 'read', resource: 'DoctorPatientActivity', scope: 'ANY' },
    ]);
    doctorPatientRepositoryMock.listActivities.mockResolvedValue({
      items: [
        {
          id: '0d8b0b7e-6c9d-4b5a-9be0-0f2fdd6d6a11',
          assignmentId,
          action: 'ASSIGNED',
          actorUserId: 'actor-user',
          occurredAt: new Date('2026-07-01T00:00:00.000Z'),
          assignment: {
            doctorId,
            patientId,
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/doctor-patient-assignments/activity')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        id: '0d8b0b7e-6c9d-4b5a-9be0-0f2fdd6d6a11',
        assignmentId,
        doctorId,
        patientId,
        action: 'ASSIGNED',
        actorUserId: 'actor-user',
        occurredAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    expect(response.body.meta.total).toBe(1);
  });
});
