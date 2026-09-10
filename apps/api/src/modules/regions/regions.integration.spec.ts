import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { RegionsRepository } from './repository/regions.repository';

describe('Regions integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const regionsRepositoryMock = {
    listProvinces: jest.fn(),
    listRegencies: jest.fn(),
    listDistricts: jest.fn(),
    listVillages: jest.fn(),
    findChain: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const provinceRecord = { code: '31', name: 'Daerah Khusus Ibukota Jakarta', parentCode: null };
  const regencyRecord = { code: '31.71', name: 'Kota Administrasi Jakarta Pusat', parentCode: '31' };
  const districtRecord = { code: '31.71.01', name: 'Gambir', parentCode: '31.71' };
  const villageRecord = { code: '31.71.01.1001', name: 'Gambir', parentCode: '31.71.01' };

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
            code: 'FRONT_DESK',
            permissions: permissions.map((permission) => ({ permission })),
          },
        },
      ],
    });
  }

  async function signReaderToken(scope: 'ANY' | 'OWN' = 'ANY'): Promise<string> {
    mockActorWithPermissions([{ action: 'read', resource: 'Patient', scope }]);
    return buildToken('reader-user', 'reader@hms.local');
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(RegionsRepository)
      .useValue(regionsRepositoryMock)
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
    regionsRepositoryMock.listProvinces.mockResolvedValue([provinceRecord]);
    regionsRepositoryMock.listRegencies.mockResolvedValue([regencyRecord]);
    regionsRepositoryMock.listDistricts.mockResolvedValue([districtRecord]);
    regionsRepositoryMock.listVillages.mockResolvedValue({ items: [villageRecord], total: 6 });
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/regions/provinces');

    expect(response.status).toBe(401);
  });

  it('returns 403 without patient.read', async () => {
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);
    const token = await buildToken('doctor-only', 'doctor-only@hms.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/provinces')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('lists provinces for a patient.read:own holder, without a parent code, cacheable for a day', async () => {
    const token = await signReaderToken('OWN');

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/provinces')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [{ code: '31', name: 'Daerah Khusus Ibukota Jakarta' }],
    });
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('requires a well-formed provinceCode on the regency list', async () => {
    const token = await signReaderToken();

    const missing = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/regencies')
      .set('Authorization', `Bearer ${token}`);
    const malformed = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/regencies?provinceCode=31.71')
      .set('Authorization', `Bearer ${token}`);

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.details).toEqual([
      expect.objectContaining({ path: ['provinceCode'] }),
    ]);
    expect(regionsRepositoryMock.listRegencies).not.toHaveBeenCalled();
  });

  it('filters regencies and districts by their parent and returns the parent code', async () => {
    const token = await signReaderToken();

    const regencies = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/regencies?provinceCode=31')
      .set('Authorization', `Bearer ${token}`);
    const districts = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/districts?regencyCode=31.71')
      .set('Authorization', `Bearer ${token}`);

    expect(regencies.status).toBe(200);
    expect(regencies.body.data).toEqual([regencyRecord]);
    expect(regionsRepositoryMock.listRegencies).toHaveBeenCalledWith('31');
    expect(districts.status).toBe(200);
    expect(districts.body.data).toEqual([districtRecord]);
    expect(regionsRepositoryMock.listDistricts).toHaveBeenCalledWith('31.71');
    expect(regencies.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('searches villages by typed prefix, paged, with defaults and a total', async () => {
    const token = await signReaderToken();

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/villages?districtCode=31.71.01&q=Ga')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(regionsRepositoryMock.listVillages).toHaveBeenCalledWith({
      districtCode: '31.71.01',
      q: 'Ga',
      page: 1,
      limit: 50,
    });
    expect(response.body).toEqual({
      data: [villageRecord],
      meta: { page: 1, limit: 50, total: 6 },
    });
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('caps the village page size and refuses a district code of the wrong shape', async () => {
    const token = await signReaderToken();

    const tooMany = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/villages?districtCode=31.71.01&limit=201')
      .set('Authorization', `Bearer ${token}`);
    const wrongShape = await request(app.getHttpServer())
      .get('/api/v1/v1/regions/villages?districtCode=3171')
      .set('Authorization', `Bearer ${token}`);

    expect(tooMany.status).toBe(400);
    expect(wrongShape.status).toBe(400);
    expect(regionsRepositoryMock.listVillages).not.toHaveBeenCalled();
  });
});
