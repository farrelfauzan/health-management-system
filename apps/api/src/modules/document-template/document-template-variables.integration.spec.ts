import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { INVOICE_TEMPLATE_VARIABLES } from '@hms/shared-types';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';

const VARIABLES_PATH = '/api/v1/v1/document-templates/variables';

/**
 * `P16-T04` over the wired stack: the guard, the Zod pipe, and the response
 * envelope. Prisma is mocked because the registry is a const — what these
 * cases prove is the chain in front of it.
 */
describe('Document template variables integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };
  /**
   * `P16-T21` put this controller behind an entitlement, and `FeatureGuard`
   * resolves it through Prisma on every request — which this suite replaces
   * wholesale. Overriding the cache rather than adding a Prisma delegate
   * keeps the "nothing was persisted" assertions below meaningful: the
   * entitlement read is not a persistence call this feature makes.
   *
   * Always enabled, which is the seeded default.
   */
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        {
          role: { code: roleCode, permissions: permissions.map((permission) => ({ permission })) },
        },
      ],
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
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
  });

  it('refuses an unauthenticated read', async () => {
    const response = await request(app.getHttpServer()).get(`${VARIABLES_PATH}?kind=INVOICE`);

    expect(response.status).toBe(401);
  });

  it('refuses an actor without the document-template grant', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', [{ action: 'read', resource: 'Invoice', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get(`${VARIABLES_PATH}?kind=INVOICE`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns the invoice registry to a permitted admin', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'DocumentTemplate', scope: 'ANY' },
    ]);

    const response = await request(app.getHttpServer())
      .get(`${VARIABLES_PATH}?kind=INVOICE`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(INVOICE_TEMPLATE_VARIABLES.length);
    expect(response.body.data[0]).toEqual({
      token: 'clinic.name',
      labelId: 'Nama klinik',
      labelEn: 'Clinic name',
      type: 'text',
      sample: 'Klinik Sehat Bersama',
    });
  });

  it.each([
    ['an unknown kind', '?kind=PRESCRIPTION'],
    ['no kind at all', ''],
  ])('refuses %s', async (_label, query) => {
    // The kind is required rather than defaulted to INVOICE: the second
    // document kind will make a silent default the wrong answer for whoever
    // forgot to pass one.
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'DocumentTemplate', scope: 'ANY' },
    ]);

    const response = await request(app.getHttpServer())
      .get(`${VARIABLES_PATH}${query}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });
});
