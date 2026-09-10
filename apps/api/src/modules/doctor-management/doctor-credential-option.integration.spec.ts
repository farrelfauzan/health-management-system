import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditRepository } from '../../common/audit/audit.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DoctorCredentialOptionRepository } from './repository/doctor-credential-option.repository';
import { DoctorManagementRepository } from './repository/doctor-management.repository';

/**
 * The doctor credential catalog over HTTP (P19-T14): the lists the doctor form
 * draws its title, degrees and fields of study from, and the admin routes that
 * extend them.
 */
describe('DoctorCredentialOption integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const optionId = '2f6f4e6a-1a1a-4d1a-9a1a-1a1a1a1a1a1a';

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const credentialOptionRepositoryMock = {
    listOptions: jest.fn(),
    findOptionById: jest.fn(),
    findOptionByKindAndCode: jest.fn(),
    createOption: jest.fn(),
    updateOption: jest.fn(),
  };

  const doctorRepositoryMock = {
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetailById: jest.fn(),
  };

  // Writes go through @Audited and the audit service; the Prisma stub has no
  // delegate to write the row with, so the audit repository is stubbed too.
  const auditRepositoryMock = {
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const degreeOption = {
    id: optionId,
    kind: 'DEGREE',
    code: 'SP_PD',
    label: 'Sp.PD',
    sortOrder: 100,
    isActive: true,
    createdAt: new Date('2026-09-10T02:00:00.000Z'),
    updatedAt: new Date('2026-09-10T02:00:00.000Z'),
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(DoctorCredentialOptionRepository)
      .useValue(credentialOptionRepositoryMock)
      .overrideProvider(DoctorManagementRepository)
      .useValue(doctorRepositoryMock)
      .overrideProvider(AuditRepository)
      .useValue(auditRepositoryMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auditRepositoryMock.createAuditLog.mockResolvedValue(undefined);
    credentialOptionRepositoryMock.listOptions.mockResolvedValue([degreeOption]);
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/doctor-credential-options');

    expect(response.status).toBe(401);
  });

  it('lists one kind, active only, for a caller holding doctor.read', async () => {
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);
    const token = await buildToken('actor-user', 'admin@hms.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/doctor-credential-options?kind=DEGREE')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(credentialOptionRepositoryMock.listOptions).toHaveBeenCalledWith({ kind: 'DEGREE' });
    expect(response.body.data).toEqual([
      expect.objectContaining({ code: 'SP_PD', label: 'Sp.PD', isActive: true }),
    ]);
  });

  it('leaves deactivated options out unless the caller asks for them', async () => {
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);
    const token = await buildToken('actor-user', 'admin@hms.local');

    await request(app.getHttpServer())
      .get('/api/v1/v1/doctor-credential-options?kind=TITLE')
      .set('Authorization', `Bearer ${token}`);
    await request(app.getHttpServer())
      .get('/api/v1/v1/doctor-credential-options?kind=TITLE&includeInactive=true')
      .set('Authorization', `Bearer ${token}`);

    expect(credentialOptionRepositoryMock.listOptions).toHaveBeenNthCalledWith(1, {
      kind: 'TITLE',
    });
    expect(credentialOptionRepositoryMock.listOptions).toHaveBeenNthCalledWith(2, {
      kind: 'TITLE',
      includeInactive: true,
    });
  });

  it('rejects a kind the catalog does not have', async () => {
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);
    const token = await buildToken('actor-user', 'admin@hms.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/doctor-credential-options?kind=NICKNAME')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it('refuses a create from a caller who may only read doctors', async () => {
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);
    const token = await buildToken('actor-user', 'doctor@hms.local');

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-credential-options')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'DEGREE', code: 'SP_GK', label: 'Sp.GK' });

    expect(response.status).toBe(403);
    expect(credentialOptionRepositoryMock.createOption).not.toHaveBeenCalled();
  });

  it('rejects a code that is not upper-snake ASCII', async () => {
    mockActorWithPermissions([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]);
    const token = await buildToken('actor-user', 'admin@hms.local');

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-credential-options')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'DEGREE', code: 'Sp.GK', label: 'Sp.GK' });

    expect(response.status).toBe(400);
    expect(credentialOptionRepositoryMock.createOption).not.toHaveBeenCalled();
  });

  it('creates an option for a caller holding doctor.update', async () => {
    mockActorWithPermissions([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]);
    credentialOptionRepositoryMock.findOptionByKindAndCode.mockResolvedValue(null);
    credentialOptionRepositoryMock.createOption.mockResolvedValue({
      ...degreeOption,
      code: 'SP_GK',
      label: 'Sp.GK',
      sortOrder: 270,
    });
    const token = await buildToken('actor-user', 'admin@hms.local');

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-credential-options')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'DEGREE', code: 'SP_GK', label: 'Sp.GK', sortOrder: 270 });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({ code: 'SP_GK' }));
  });

  it('refuses a duplicate code within a kind', async () => {
    mockActorWithPermissions([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]);
    credentialOptionRepositoryMock.findOptionByKindAndCode.mockResolvedValue(degreeOption);
    const token = await buildToken('actor-user', 'admin@hms.local');

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/doctor-credential-options')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'DEGREE', code: 'SP_PD', label: 'Sp.PD' });

    expect(response.status).toBe(409);
  });

  it('deactivates an option without deleting it', async () => {
    mockActorWithPermissions([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]);
    credentialOptionRepositoryMock.findOptionById.mockResolvedValue(degreeOption);
    credentialOptionRepositoryMock.updateOption.mockResolvedValue({
      ...degreeOption,
      isActive: false,
    });
    const token = await buildToken('actor-user', 'admin@hms.local');

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/doctor-credential-options/${optionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(credentialOptionRepositoryMock.updateOption).toHaveBeenCalledWith(optionId, {
      isActive: false,
    });
    expect(response.body.data.isActive).toBe(false);
  });

  it('returns 404 for an option id that is not on file', async () => {
    mockActorWithPermissions([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]);
    credentialOptionRepositoryMock.findOptionById.mockResolvedValue(null);
    const token = await buildToken('actor-user', 'admin@hms.local');

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/v1/doctor-credential-options/${optionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Sp.P.D.' });

    expect(response.status).toBe(404);
  });
});
