import { createCipheriv, createHash, createHmac } from 'node:crypto';

import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import LZString from 'lz-string';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';

/**
 * P11-T03 reference-sync integration tests. Auth and Prisma are mocked
 * (Prisma as in-memory stores), but the repository, credential crypto, HTTP
 * client, signing, and response codec all run for real: the fetch stub
 * verifies the HMAC signature of every outgoing request and encrypts each
 * reply with the timestamp that request actually carried — so a green sync
 * proves sign → decode → parse → replace for every enumerable catalog, and
 * the mapping tests prove codes are validated against what was synced.
 */
describe('BPJS PCare reference sync integration', () => {
  const TEST_ENV: Record<string, string> = {
    BPJS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString('base64'),
    BPJS_PCARE_RETRY_BASE_DELAY_MS: '1',
    BPJS_PCARE_MAX_RETRY_ATTEMPTS: '0',
    SATUSEHAT_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const inputConsId = '20250001';
  const inputSecretKey = 'spike-secret-key-value';
  const inputCreateBody = {
    environment: 'DEVELOPMENT',
    consId: inputConsId,
    kdProviderPpk: '01000101',
    pcareUsername: 'klinik-demo',
    secretKey: inputSecretKey,
    userKey: 'spike-user-key-value',
    pcarePassword: 'spike-password-value',
    isActive: true,
  };
  const doctorRowId = '7c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let configRow: Record<string, unknown> | null = null;
  let referenceRows: Array<Record<string, unknown>> = [];
  let doctorRow: Record<string, unknown> = {};

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  const bpjsPcareConfigDelegate = {
    findFirst: jest.fn(() => Promise.resolve(configRow === null ? null : { ...configRow })),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      configRow = {
        id: '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9',
        credentialKeyVersion: 1,
        isActive: true,
        lastTestedAt: null,
        lastTestResult: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      return Promise.resolve({ ...configRow });
    }),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      configRow = { ...(configRow as Record<string, unknown>), ...data, updatedAt: new Date() };
      return Promise.resolve({ ...configRow });
    }),
    delete: jest.fn(() => Promise.resolve(configRow)),
  };

  function matchesSearch(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    const orClauses = where.OR as Array<Record<string, Record<string, string>>> | undefined;
    if (orClauses === undefined) {
      return true;
    }
    const code = String(row.code).toLowerCase();
    const display = String(row.display).toLowerCase();
    return orClauses.some((clause) => {
      const codePrefix = clause.code?.startsWith;
      if (codePrefix !== undefined) {
        return code.startsWith(codePrefix.toLowerCase());
      }
      const displayTerm = clause.display?.contains;
      return displayTerm !== undefined && display.includes(displayTerm.toLowerCase());
    });
  }

  const bpjsReferenceItemDelegate = {
    deleteMany: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const previousCount = referenceRows.length;
      referenceRows = referenceRows.filter((row) => row.catalog !== where.catalog);
      return Promise.resolve({ count: previousCount - referenceRows.length });
    }),
    createMany: jest.fn(({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const row of data) {
        referenceRows.push({ id: `ref-${referenceRows.length}`, groupCode: null, ...row });
      }
      return Promise.resolve({ count: data.length });
    }),
    upsert: jest.fn(
      ({
        where,
        create,
      }: {
        where: { catalog_code: { catalog: string; code: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = referenceRows.find(
          (row) =>
            row.catalog === where.catalog_code.catalog && row.code === where.catalog_code.code,
        );
        if (existing === undefined) {
          const created = { id: `ref-${referenceRows.length}`, groupCode: null, ...create };
          referenceRows.push(created);
          return Promise.resolve({ ...created });
        }
        return Promise.resolve({ ...existing });
      },
    ),
    findUnique: jest.fn(
      ({ where }: { where: { catalog_code: { catalog: string; code: string } } }) => {
        const found = referenceRows.find(
          (row) =>
            row.catalog === where.catalog_code.catalog && row.code === where.catalog_code.code,
        );
        return Promise.resolve(found === undefined ? null : { ...found });
      },
    ),
    findMany: jest.fn(({ where, take }: { where: Record<string, unknown>; take: number }) => {
      const matches = referenceRows
        .filter((row) => row.catalog === where.catalog && matchesSearch(row, where))
        .slice(0, take);
      return Promise.resolve(matches.map((row) => ({ ...row })));
    }),
    groupBy: jest.fn(() => {
      const catalogNames = [...new Set(referenceRows.map((row) => String(row.catalog)))];
      return Promise.resolve(
        catalogNames.map((catalog) => {
          const catalogRows = referenceRows.filter((row) => row.catalog === catalog);
          return {
            catalog,
            _count: { _all: catalogRows.length },
            _max: {
              syncedAt: catalogRows
                .map((row) => row.syncedAt as Date)
                .sort((left, right) => right.getTime() - left.getTime())[0],
            },
          };
        }),
      );
    }),
  };

  const doctorProfileDelegate = {
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.id === doctorRowId ? { id: doctorRowId } : null),
    ),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      doctorRow = { ...doctorRow, ...data };
      return Promise.resolve({
        id: doctorRowId,
        fullName: doctorRow.fullName,
        bpjsDoctorCode: doctorRow.bpjsDoctorCode ?? null,
        specialty: { name: 'Dokter Umum' },
      });
    }),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    findFirstActive: jest.fn(
      (delegate: { findFirst: (args: unknown) => Promise<unknown> }, args: { where?: object }) =>
        delegate.findFirst({ ...args, where: { ...args.where, deletedAt: null } }),
    ),
    findManyActive: jest.fn(
      (delegate: { findMany: (args: unknown) => Promise<unknown> }, args: { where?: object }) =>
        delegate.findMany({ ...args, where: { ...args.where, deletedAt: null } }),
    ),
    bpjsPcareConfig: bpjsPcareConfigDelegate,
    bpjsReferenceItem: bpjsReferenceItemDelegate,
    doctorProfile: doctorProfileDelegate,
  };

  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: accessTokenSecret });
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

  function mockBpjsAdminPermissions(): void {
    mockActorWithPermissions([
      { action: 'manage', resource: 'BpjsConfig', scope: 'ANY' },
      { action: 'sync', resource: 'BpjsReference', scope: 'ANY' },
      { action: 'read', resource: 'BpjsReference', scope: 'ANY' },
      { action: 'manage', resource: 'BpjsMapping', scope: 'ANY' },
    ]);
  }

  function encryptPcareResponse(timestamp: string, payload: unknown): string {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    const hash = createHash('sha256')
      .update(`${inputConsId}${inputSecretKey}${timestamp}`)
      .digest();
    const cipher = createCipheriv('aes-256-cbc', hash, hash.subarray(0, 16));
    return Buffer.concat([cipher.update(compressed, 'utf8'), cipher.final()]).toString('base64');
  }

  function buildReferencePayload(pathname: string): unknown {
    if (/\/poli\/fktp\/\d+\/\d+$/.test(pathname)) {
      return {
        count: 2,
        list: [
          { kdPoli: '001', nmPoli: 'POLI UMUM' },
          { kdPoli: '002', nmPoli: 'POLI GIGI' },
        ],
      };
    }
    if (/\/dokter\/\d+\/\d+$/.test(pathname)) {
      return { count: 1, list: [{ kdDokter: '1234', nmDokter: 'dr. Sinta Dewi' }] };
    }
    if (/\/kesadaran$/.test(pathname)) {
      return { list: [{ kdSadar: '01', nmSadar: 'Compos Mentis' }] };
    }
    const tindakanMatch = /\/tindakan\/kdTkp\/(\d+)\/\d+\/\d+$/.exec(pathname);
    if (tindakanMatch !== null) {
      return {
        count: 1,
        list: [{ kdTindakan: `T${tindakanMatch[1]}`, nmTindakan: `Tindakan ${tindakanMatch[1]}` }],
      };
    }
    if (/\/spesialis$/.test(pathname)) {
      return { list: [{ kdSpesialis: 'ANA', nmSpesialis: 'Anak' }] };
    }
    if (/\/spesialis\/sarana$/.test(pathname)) {
      return { list: [{ kdSarana: '1', nmSarana: 'Laboratorium' }] };
    }
    if (/\/obat\/dpho\/paracetamol\/\d+\/\d+$/.test(pathname)) {
      return { count: 1, list: [{ kdObat: 'K0001', nmObat: 'PARACETAMOL TAB 500 MG' }] };
    }
    return null;
  }

  function stubReferenceTransportVerifyingSignature(): void {
    fetchMock.mockImplementation((url: string | URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const timestamp = headers['X-Timestamp'] ?? '';
      const expectedSignature = createHmac('sha256', inputSecretKey)
        .update(`${inputConsId}&${timestamp}`)
        .digest('base64');
      if (headers['X-Signature'] !== expectedSignature) {
        return Promise.resolve(new Response('bad signature', { status: 401 }));
      }
      const pathname = new URL(String(url)).pathname;
      const body = JSON.stringify({
        metaData: { code: '200', message: 'OK' },
        response: encryptPcareResponse(timestamp, buildReferencePayload(pathname)),
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
  }

  async function storeConfiguration(token: string): Promise<void> {
    await request(app.getHttpServer())
      .put('/api/v1/v1/bpjs/config')
      .set('Authorization', `Bearer ${token}`)
      .send(inputCreateBody)
      .expect(200);
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    global.fetch = fetchMock as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    accessTokenSecret =
      moduleRef.get(ConfigService).get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret';
  });

  afterAll(async () => {
    await app.close();
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configRow = null;
    referenceRows = [];
    doctorRow = { id: doctorRowId, fullName: 'dr. Sinta Dewi', bpjsDoctorCode: null };
    mockBpjsAdminPermissions();
    stubReferenceTransportVerifyingSignature();
  });

  it('refuses the sync without the sync permission', async () => {
    mockActorWithPermissions([{ action: 'read', resource: 'BpjsReference', scope: 'ANY' }]);
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/reference/sync')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 for the sync before any configuration is stored', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');

    await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/reference/sync')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('syncs the six enumerable catalogs through the real signing and codec chain', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);

    const syncResponse = await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/reference/sync')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(syncResponse.body.data.catalogs).toEqual([
      { catalog: 'POLI', itemCount: 2 },
      { catalog: 'DOKTER', itemCount: 1 },
      { catalog: 'KESADARAN', itemCount: 1 },
      { catalog: 'TINDAKAN', itemCount: 3 },
      { catalog: 'SPESIALIS', itemCount: 1 },
      { catalog: 'SARANA', itemCount: 1 },
    ]);
    expect(referenceRows).toHaveLength(9);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BPJS_REFERENCE_SYNCED' }),
    );

    const statusResponse = await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/reference/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const poliStatus = statusResponse.body.data.find(
      (entry: { catalog: string }) => entry.catalog === 'POLI',
    );
    expect(poliStatus).toMatchObject({ itemCount: 2, isSyncable: true });

    const searchResponse = await request(app.getHttpServer())
      .get('/api/v1/v1/bpjs/reference/poli?search=gigi')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(searchResponse.body.data).toEqual([
      expect.objectContaining({ catalog: 'POLI', code: '002', display: 'POLI GIGI' }),
    ]);
  });

  it('caches DPHO keyword results through the live search endpoint', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);

    const remoteResponse = await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/reference/dpho/search')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'paracetamol' })
      .expect(200);

    expect(remoteResponse.body.data).toEqual([
      expect.objectContaining({ catalog: 'DPHO', code: 'K0001' }),
    ]);
    expect(
      referenceRows.some((row) => row.catalog === 'DPHO' && row.code === 'K0001'),
    ).toBe(true);
  });

  it('rejects the live search for a bulk-synced catalog', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);

    await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/reference/poli/search')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'umum' })
      .expect(400);
  });

  it('validates a doctor mapping against the synced catalog and stores it', async () => {
    const token = await buildToken('actor-user', 'admin@example.com');
    await storeConfiguration(token);

    const unknownCodeResponse = await request(app.getHttpServer())
      .put(`/api/v1/v1/bpjs/mappings/doctors/${doctorRowId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bpjsDoctorCode: '1234' })
      .expect(400);
    expect(unknownCodeResponse.body.error.message).toContain('DOKTER');

    await request(app.getHttpServer())
      .post('/api/v1/v1/bpjs/reference/sync')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const mappingResponse = await request(app.getHttpServer())
      .put(`/api/v1/v1/bpjs/mappings/doctors/${doctorRowId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bpjsDoctorCode: '1234' })
      .expect(200);

    expect(mappingResponse.body.data).toMatchObject({
      doctorId: doctorRowId,
      bpjsDoctorCode: '1234',
    });
    expect(doctorRow.bpjsDoctorCode).toBe('1234');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_MAPPING_UPDATED',
        resource: 'DoctorProfile',
        resourceId: doctorRowId,
        metadata: { bpjsDoctorCode: '1234' },
      }),
    );
  });
});
