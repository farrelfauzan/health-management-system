import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { PatientManagementRepository } from './repository/patient-management.repository';

describe('PatientManagement integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const patientRepositoryMock = {
    listPatients: jest.fn(),
    findPatientById: jest.fn(),
    findPatientDetailById: jest.fn(),
    findPatientByMrn: jest.fn(),
    findActiveUserById: jest.fn(),
    findActiveDoctorsByIds: jest.fn(),
    hasActiveAssignmentWithDoctorUser: jest.fn(),
    createPatient: jest.fn(),
    updatePatient: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(PatientManagementRepository)
      .useValue(patientRepositoryMock)
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

    patientRepositoryMock.listPatients.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
    });
    patientRepositoryMock.findPatientByMrn.mockResolvedValue(null);
    patientRepositoryMock.findActiveUserById.mockResolvedValue(null);
    patientRepositoryMock.createPatient.mockResolvedValue({
      id: '5bd5e23d-098a-4ee6-a777-cf5f850ece2f',
      mrn: 'MRN-1001',
      fullName: 'Patient One',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '123456',
      address: 'Main Street',
      ownerUserId: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    patientRepositoryMock.findPatientById.mockResolvedValue({
      id: 'f746de50-6b45-4351-9bb6-45aeb3f671f9',
      mrn: 'MRN-OWN-01',
      fullName: 'Owned Patient',
      dateOfBirth: new Date('1992-02-02T00:00:00.000Z'),
      phoneNumber: '999999',
      address: 'Owner Street',
      ownerUserId: 'own-user',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    patientRepositoryMock.findPatientDetailById.mockResolvedValue({
      id: 'f746de50-6b45-4351-9bb6-45aeb3f671f9',
      mrn: 'MRN-OWN-01',
      fullName: 'Owned Patient',
      dateOfBirth: new Date('1992-02-02T00:00:00.000Z'),
      phoneNumber: '999999',
      address: 'Owner Street',
      ownerUserId: 'own-user',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      doctors: [],
    });
    patientRepositoryMock.hasActiveAssignmentWithDoctorUser.mockResolvedValue(false);
    patientRepositoryMock.findActiveDoctorsByIds.mockResolvedValue([]);
  });

  it('returns 401 when bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/patients');

    expect(response.status).toBe(401);
  });

  it('returns 403 when user lacks patient.read permission', async () => {
    const token = await jwtService.signAsync(
      {
        sub: 'no-read-user',
        email: 'no-read@hms.local',
      },
      {
        secret: 'dev-access-secret',
      },
    );

    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'no-read-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              {
                permission: {
                  action: 'read',
                  resource: 'Role',
                  scope: 'ANY',
                },
              },
            ],
          },
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/patients')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 200 for patient list with read:any permission', async () => {
    const token = await jwtService.signAsync(
      {
        sub: 'admin-user',
        email: 'admin@hms.local',
      },
      {
        secret: 'dev-access-secret',
      },
    );

    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              {
                permission: {
                  action: 'read',
                  resource: 'Patient',
                  scope: 'ANY',
                },
              },
            ],
          },
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/patients')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(patientRepositoryMock.listPatients).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ sub: 'admin-user' }),
      true,
    );
  });

  it('returns 403 when read:own user requests unowned patient detail', async () => {
    const token = await jwtService.signAsync(
      {
        sub: 'own-user',
        email: 'own@hms.local',
      },
      {
        secret: 'dev-access-secret',
      },
    );

    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'own-user',
      roles: [
        {
          role: {
            code: 'PATIENT',
            permissions: [
              {
                permission: {
                  action: 'read',
                  resource: 'Patient',
                  scope: 'OWN',
                },
              },
            ],
          },
        },
      ],
    });

    patientRepositoryMock.findPatientDetailById.mockResolvedValue({
      id: 'f746de50-6b45-4351-9bb6-45aeb3f671f9',
      mrn: 'MRN-OTHER-01',
      fullName: 'Other Patient',
      dateOfBirth: new Date('1992-02-02T00:00:00.000Z'),
      phoneNumber: '999999',
      address: 'Owner Street',
      ownerUserId: 'someone-else',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      doctors: [],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/patients/f746de50-6b45-4351-9bb6-45aeb3f671f9')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 409 when creating patient with duplicate MRN', async () => {
    const token = await jwtService.signAsync(
      {
        sub: 'admin-user',
        email: 'admin@hms.local',
      },
      {
        secret: 'dev-access-secret',
      },
    );

    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              {
                permission: {
                  action: 'create',
                  resource: 'Patient',
                  scope: 'ANY',
                },
              },
            ],
          },
        },
      ],
    });

    patientRepositoryMock.findPatientByMrn.mockResolvedValue({
      id: 'existing-patient',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mrn: 'MRN-1001',
        fullName: 'Patient One',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
        phoneNumber: '123456',
        address: 'Main Street',
      });

    expect(response.status).toBe(409);
  });
});
