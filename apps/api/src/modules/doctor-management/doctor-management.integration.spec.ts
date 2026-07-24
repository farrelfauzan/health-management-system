import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DoctorManagementRepository } from './repository/doctor-management.repository';

describe('DoctorManagement integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const doctorRepositoryMock = {
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetailById: jest.fn(),
    findDoctorByLicenseNumber: jest.fn(),
    findDoctorByOwnerUserId: jest.fn(),
    findActiveUserById: jest.fn(),
    findActiveSpecialtyById: jest.fn(),
    findActivePatientsByIds: jest.fn(),
    createDoctor: jest.fn(),
    replaceDoctorSchedules: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const specialtyId = '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111';

  const doctorRecord = {
    id: doctorId,
    licenseNumber: 'LIC-0001',
    fullName: 'Dr. First',
    specialtyId,
    specialty: { id: specialtyId, name: 'Cardiology' },
    phoneNumber: '0812345678',
    ownerUserId: null,
    isActive: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
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
      .overrideProvider(DoctorManagementRepository)
      .useValue(doctorRepositoryMock)
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

    doctorRepositoryMock.listDoctors.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
    });
    doctorRepositoryMock.findDoctorByLicenseNumber.mockResolvedValue(null);
    doctorRepositoryMock.findActivePatientsByIds.mockResolvedValue([]);
    doctorRepositoryMock.createDoctor.mockResolvedValue(doctorRecord);
    doctorRepositoryMock.findDoctorById.mockResolvedValue(doctorRecord);
    doctorRepositoryMock.replaceDoctorSchedules.mockResolvedValue([]);
  });

  it('returns 401 when bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/doctors');

    expect(response.status).toBe(401);
  });

  it('returns 403 when user lacks doctor.read permission', async () => {
    const token = await buildToken('no-read-user', 'no-read@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Patient', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/doctors')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 200 for doctor list with read:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/doctors')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(doctorRepositoryMock.listDoctors).toHaveBeenCalled();
  });

  it('creates a doctor with create:any permission', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]);
    doctorRepositoryMock.findActiveSpecialtyById.mockResolvedValue({ id: specialtyId });

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        licenseNumber: 'LIC-0001',
        fullName: 'Dr. First',
        specialtyId,
        phoneNumber: '0812345678',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: doctorId,
        licenseNumber: 'LIC-0001',
      }),
    );
    expect(doctorRepositoryMock.createDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'admin-user' }),
    );
  });

  it('returns 409 when creating a doctor with duplicate license number', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]);
    doctorRepositoryMock.findDoctorByLicenseNumber.mockResolvedValue({ id: 'existing-doctor' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        licenseNumber: 'LIC-0001',
        fullName: 'Dr. First',
        specialtyId,
        phoneNumber: '0812345678',
      });

    expect(response.status).toBe(409);
  });

  it('returns 403 when own-scope user writes another doctor schedule', async () => {
    const token = await buildToken('own-doctor-user', 'own-doctor@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'DoctorSchedule', scope: 'OWN' }]);
    doctorRepositoryMock.findDoctorById.mockResolvedValue({
      ...doctorRecord,
      ownerUserId: 'someone-else',
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/doctors/${doctorId}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        schedules: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true }],
      });

    expect(response.status).toBe(403);
    expect(doctorRepositoryMock.replaceDoctorSchedules).not.toHaveBeenCalled();
  });

  it('updates own doctor schedule with write:own permission', async () => {
    const token = await buildToken('own-doctor-user', 'own-doctor@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'DoctorSchedule', scope: 'OWN' }]);
    doctorRepositoryMock.findDoctorById.mockResolvedValue({
      ...doctorRecord,
      ownerUserId: 'own-doctor-user',
    });
    doctorRepositoryMock.replaceDoctorSchedules.mockResolvedValue([
      {
        id: 'b7c9a316-40b2-4f4c-9207-2a58028babc4',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '12:00',
        isAvailable: true,
      },
    ]);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/doctors/${doctorId}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        schedules: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true }],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }),
    ]);
    expect(doctorRepositoryMock.replaceDoctorSchedules).toHaveBeenCalledWith({
      doctorId,
      entries: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true, maxPatients: null },
      ],
    });
  });
});
