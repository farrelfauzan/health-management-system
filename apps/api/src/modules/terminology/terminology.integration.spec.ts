import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { Icd9cmCodeRepository } from './repository/icd9cm-code.repository';
import { Icd10CodeRepository } from './repository/icd10-code.repository';

describe('Terminology integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const icd10CodeRepositoryMock = {
    searchIcd10Codes: jest.fn(),
  };

  const icd9cmCodeRepositoryMock = {
    searchIcd9cmCodes: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const icd10CodeRecord = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    code: 'J06.9',
    display: 'Acute upper respiratory infection, unspecified',
    displayIndonesian: 'Infeksi saluran napas atas akut, tidak dijelaskan',
    category: 'J06',
    chapter: 'X',
    isActive: true,
  };

  const icd9cmCodeRecord = {
    id: 'ffffffff-ffff-4fff-8fff-fffffffffff9',
    code: '93.94',
    display: 'Respiratory medication administered by nebulizer',
    displayIndonesian: 'Pemberian obat pernapasan melalui nebulizer',
    category: '93',
    isActive: true,
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
            code: 'DOCTOR',
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
      .overrideProvider(Icd10CodeRepository)
      .useValue(icd10CodeRepositoryMock)
      .overrideProvider(Icd9cmCodeRepository)
      .useValue(icd9cmCodeRepositoryMock)
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
    icd10CodeRepositoryMock.searchIcd10Codes.mockResolvedValue([icd10CodeRecord]);
    icd9cmCodeRepositoryMock.searchIcd9cmCodes.mockResolvedValue([icd9cmCodeRecord]);
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/icd10-codes');

    expect(response.status).toBe(401);
  });

  it('returns 403 when the user lacks icd10-code.read permission', async () => {
    const token = await buildToken('no-read-user', 'no-read@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/icd10-codes')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns matching codes for a permitted user', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Icd10Code', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/icd10-codes?search=J06')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([icd10CodeRecord]);
  });

  it('applies the default limit when the query omits one', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Icd10Code', scope: 'ANY' }]);

    await request(app.getHttpServer())
      .get('/api/v1/v1/icd10-codes?search=demam')
      .set('Authorization', `Bearer ${token}`);

    expect(icd10CodeRepositoryMock.searchIcd10Codes).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'demam', limit: 20 }),
    );
  });

  it('rejects a limit above the maximum instead of silently clamping it', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Icd10Code', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/icd10-codes?limit=500')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(icd10CodeRepositoryMock.searchIcd10Codes).not.toHaveBeenCalled();
  });

  it('returns 403 on the procedure lookup when the user only holds the diagnosis grant', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Icd10Code', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/icd9cm-codes')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns matching procedure codes for a permitted user', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Icd9cmCode', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/icd9cm-codes?search=nebul')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([icd9cmCodeRecord]);
    expect(icd9cmCodeRepositoryMock.searchIcd9cmCodes).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'nebul', limit: 20 }),
    );
  });
});
