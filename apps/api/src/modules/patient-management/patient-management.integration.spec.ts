import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { PatientManagementRepository } from './repository/patient-management.repository';

/**
 * Every create and import payload carries privacy-notice evidence since
 * P12-T04 made it required. The repository is mocked in this suite, so this
 * only has to satisfy the schema; the version id is the one the privacy-notice
 * migration inserts.
 */
const SPEC_PRIVACY_NOTICE = {
  privacyNoticeVersionId: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9',
  locale: 'id',
  outcome: 'ACKNOWLEDGED',
  subjectType: 'SELF',
  provenance: 'FRONT_DESK',
} as const;

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
    findPatientIdByNik: jest.fn(),
    findPatientIdByBpjsNumber: jest.fn(),
    findActiveUserById: jest.fn(),
    findActiveDoctorsByIds: jest.fn(),
    findPatientIdentifiers: jest.fn(),
    createPatient: jest.fn(),
    updatePatient: jest.fn(),
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
    app.useGlobalPipes(new ZodValidationPipe());
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
    patientRepositoryMock.findPatientIdByNik.mockResolvedValue(null);
    patientRepositoryMock.findPatientIdByBpjsNumber.mockResolvedValue(null);
    patientRepositoryMock.findActiveUserById.mockResolvedValue(null);
    patientRepositoryMock.createPatient.mockResolvedValue({
      id: '5bd5e23d-098a-4ee6-a777-cf5f850ece2f',
      mrn: '00001001',
      fullName: 'Patient One',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      placeOfBirth: null,
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '123456',
      address: 'Main Street',
      nikLast4: '0001',
      bpjsNumberLast4: null,
      hasSatusehatPatientId: false,
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
    expect(patientRepositoryMock.listPatients).toHaveBeenCalledWith(expect.any(Object), {
      userId: 'admin-user',
      scope: 'ANY',
    });
  });

  it('returns 404 when read:own user requests unowned patient detail', async () => {
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

    // The scoped repository where-clause already filtered someone else's row
    // in SQL, so the repository reports it exactly like a missing record —
    // and the route answers 404, denying a UUID probe the existence oracle.
    patientRepositoryMock.findPatientDetailById.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/patients/f746de50-6b45-4351-9bb6-45aeb3f671f9')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(patientRepositoryMock.findPatientDetailById).toHaveBeenCalledWith(
      'f746de50-6b45-4351-9bb6-45aeb3f671f9',
      { userId: 'own-user', scope: 'OWN' },
    );
  });

  describe('medical record numbers', () => {
    async function signTokenWith(
      permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
    ): Promise<string> {
      authRepositoryMock.findUserById.mockResolvedValue({
        id: 'admin-user',
        roles: [
          {
            role: {
              code: 'ADMIN',
              permissions: permissions.map((permission) => ({ permission })),
            },
          },
        ],
      });

      return jwtService.signAsync(
        { sub: 'admin-user', email: 'admin@hms.local' },
        { secret: 'dev-access-secret' },
      );
    }

    it('rejects a client-supplied MRN on the create route', async () => {
      const token = await signTokenWith([
        { action: 'create', resource: 'Patient', scope: 'ANY' },
      ]);

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
          privacyNotice: SPEC_PRIVACY_NOTICE,
        });

      expect(response.status).toBe(201);
      // Stripped by the schema, never forwarded to the repository — the MRN on
      // the response is the one the counter allocated.
      expect(patientRepositoryMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({ mrn: undefined }),
      );
      expect(response.body.data.mrn).toBe('00001001');
    });

    it('returns 403 on the import route without patient.import-identifier', async () => {
      const token = await signTokenWith([
        { action: 'create', resource: 'Patient', scope: 'ANY' },
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/patients/import')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mrn: 'RM-2019-0417',
          fullName: 'Patient One',
          dateOfBirth: '1990-01-01',
          sex: 'MALE',
          phoneNumber: '123456',
          address: 'Main Street',
          privacyNotice: SPEC_PRIVACY_NOTICE,
        });

      expect(response.status).toBe(403);
    });

    it('imports a legacy MRN verbatim', async () => {
      const token = await signTokenWith([
        { action: 'import-identifier', resource: 'Patient', scope: 'ANY' },
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/patients/import')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mrn: 'RM-2019-0417',
          fullName: 'Patient One',
          dateOfBirth: '1990-01-01',
          sex: 'MALE',
          phoneNumber: '123456',
          address: 'Main Street',
          privacyNotice: SPEC_PRIVACY_NOTICE,
        });

      expect(response.status).toBe(201);
      expect(patientRepositoryMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({ mrn: 'RM-2019-0417' }),
      );
    });

    it('returns 409 when an imported MRN is already in use', async () => {
      const token = await signTokenWith([
        { action: 'import-identifier', resource: 'Patient', scope: 'ANY' },
      ]);

      patientRepositoryMock.findPatientByMrn.mockResolvedValue({ id: 'existing-patient' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/patients/import')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mrn: 'RM-2019-0417',
          fullName: 'Patient One',
          dateOfBirth: '1990-01-01',
          sex: 'MALE',
          phoneNumber: '123456',
          address: 'Main Street',
          privacyNotice: SPEC_PRIVACY_NOTICE,
        });

      expect(response.status).toBe(409);
      expect(patientRepositoryMock.createPatient).not.toHaveBeenCalled();
    });

    it('returns 403 on the unmask route without patient.read-identifier', async () => {
      const token = await signTokenWith([{ action: 'read', resource: 'Patient', scope: 'ANY' }]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/patients/f746de50-6b45-4351-9bb6-45aeb3f671f9/identifiers')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(patientRepositoryMock.findPatientIdentifiers).not.toHaveBeenCalled();
    });

    it('returns the decrypted identifiers with patient.read-identifier', async () => {
      const token = await signTokenWith([
        { action: 'read-identifier', resource: 'Patient', scope: 'ANY' },
      ]);

      patientRepositoryMock.findPatientIdentifiers.mockResolvedValue({
        nik: '3201015205900001',
        bpjsNumber: null,
        satusehatPatientId: null,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/patients/f746de50-6b45-4351-9bb6-45aeb3f671f9/identifiers')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.nik).toBe('3201015205900001');
      expect(response.body.data.bpjsNumber).toBeUndefined();
    });
  });

  describe('national and payer identifiers', () => {
    async function signCreateToken(): Promise<string> {
      authRepositoryMock.findUserById.mockResolvedValue({
        id: 'admin-user',
        roles: [
          {
            role: {
              code: 'ADMIN',
              permissions: [
                { permission: { action: 'create', resource: 'Patient', scope: 'ANY' } },
              ],
            },
          },
        ],
      });

      return jwtService.signAsync(
        { sub: 'admin-user', email: 'admin@hms.local' },
        { secret: 'dev-access-secret' },
      );
    }

    it('returns the NIK masked and never in plaintext', async () => {
      const token = await signCreateToken();

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
          privacyNotice: SPEC_PRIVACY_NOTICE,
          nik: '3201010101900001',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.nikMasked).toBe('••••••••0001');
      expect(JSON.stringify(response.body)).not.toContain('3201010101900001');
    });

    it('rejects a malformed NIK', async () => {
      const token = await signCreateToken();

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
          privacyNotice: SPEC_PRIVACY_NOTICE,
          nik: '12345',
        });

      expect(response.status).toBe(400);
      expect(patientRepositoryMock.createPatient).not.toHaveBeenCalled();
    });

    it('accepts a NIK written with separators', async () => {
      const token = await signCreateToken();

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
          privacyNotice: SPEC_PRIVACY_NOTICE,
          nik: '3201 0101 0190 0001',
        });

      expect(response.status).toBe(201);
      expect(patientRepositoryMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({ nik: '3201010101900001' }),
      );
    });

    it('returns 409 when the NIK already belongs to another patient', async () => {
      const token = await signCreateToken();
      patientRepositoryMock.findPatientIdByNik.mockResolvedValue({ id: 'existing-patient' });

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
          privacyNotice: SPEC_PRIVACY_NOTICE,
          nik: '3201010101900001',
        });

      expect(response.status).toBe(409);
      expect(patientRepositoryMock.createPatient).not.toHaveBeenCalled();
    });

    it('surfaces a demographic mismatch as a warning rather than a rejection', async () => {
      const token = await signCreateToken();

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
          privacyNotice: SPEC_PRIVACY_NOTICE,
          nik: '3201014101900001',
        });

      expect(response.status).toBe(201);
      expect(response.body.meta.identifierWarnings).toEqual([
        'NIK encodes FEMALE but MALE was submitted',
      ]);
    });
  });

  describe('demographic and clinical-safety fields', () => {
    async function signCreateToken(): Promise<string> {
      authRepositoryMock.findUserById.mockResolvedValue({
        id: 'admin-user',
        roles: [
          {
            role: {
              code: 'ADMIN',
              permissions: [
                { permission: { action: 'create', resource: 'Patient', scope: 'ANY' } },
              ],
            },
          },
        ],
      });

      return jwtService.signAsync(
        { sub: 'admin-user', email: 'admin@hms.local' },
        { secret: 'dev-access-secret' },
      );
    }

    function buildCreateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        mrn: 'MRN-1001',
        fullName: 'Patient One',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
        phoneNumber: '123456',
        address: 'Main Street',
        privacyNotice: SPEC_PRIVACY_NOTICE,
        ...overrides,
      };
    }

    it('accepts the full demographic payload', async () => {
      const token = await signCreateToken();

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send(
          buildCreateBody({
            placeOfBirth: 'Bandung',
            email: 'patient.one@example.com',
            bloodType: 'O',
            rhesusFactor: 'POSITIVE',
            maritalStatus: 'MARRIED',
            occupation: 'Teacher',
            religion: 'ISLAM',
            emergencyContactName: 'Rahmat Rahman',
            emergencyContactPhone: '+628123456700',
            guardianName: 'Rahmat Rahman',
            guardianRelation: 'Spouse',
          }),
        );

      expect(response.status).toBe(201);
      expect(patientRepositoryMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          placeOfBirth: 'Bandung',
          bloodType: 'O',
          rhesusFactor: 'POSITIVE',
          religion: 'ISLAM',
          guardianRelation: 'Spouse',
        }),
      );
    });

    it('rejects an unrecognised religion value', async () => {
      const token = await signCreateToken();

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send(buildCreateBody({ religion: 'JEDI' }));

      expect(response.status).toBe(400);
      expect(patientRepositoryMock.createPatient).not.toHaveBeenCalled();
    });

    it('accepts a structured allergy list', async () => {
      const token = await signCreateToken();

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send(
          buildCreateBody({
            allergies: [
              { substance: 'Penicillin', reaction: 'Urticaria', severity: 'SEVERE' },
              { substance: 'Peanuts', severity: 'MILD' },
            ],
          }),
        );

      expect(response.status).toBe(201);
      expect(patientRepositoryMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          allergies: [
            { substance: 'Penicillin', reaction: 'Urticaria', severity: 'SEVERE' },
            { substance: 'Peanuts', severity: 'MILD' },
          ],
        }),
      );
    });

    it('rejects a duplicate allergy substance', async () => {
      const token = await signCreateToken();

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send(
          buildCreateBody({
            allergies: [
              { substance: 'Penicillin', severity: 'SEVERE' },
              { substance: 'penicillin', severity: 'MILD' },
            ],
          }),
        );

      expect(response.status).toBe(400);
      expect(patientRepositoryMock.createPatient).not.toHaveBeenCalled();
    });
  });
});
