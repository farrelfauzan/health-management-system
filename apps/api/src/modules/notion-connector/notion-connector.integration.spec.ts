import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { BUG_BOARD_REQUIRED_FIELDS } from './service/bug-board-required-fields';

const STATUS_PATH = '/api/v1/v1/admin/integrations/notion/status';
const TEST_CONNECTION_PATH = '/api/v1/v1/admin/integrations/notion/test-connection';
const DATA_SOURCE_ID = '11111111-2222-4333-8444-5555555f5f21';

function buildHealthyBoardBody(): Record<string, unknown> {
  return {
    id: DATA_SOURCE_ID,
    properties: Object.fromEntries(
      BUG_BOARD_REQUIRED_FIELDS.map((requirement) => [
        requirement.field,
        requirement.type === 'select'
          ? {
              type: 'select',
              select: { options: (requirement.options ?? []).map((name) => ({ name })) },
            }
          : { type: requirement.type },
      ]),
    ),
  };
}

/**
 * P23-T04 surface tests. Auth and Prisma are stubbed; the controller, the
 * permission guard, the connector service, the field checker and the Notion
 * HTTP client all run for real against a stubbed `fetch` — so a green run
 * proves the whole status → retrieve → check → report chain, including that
 * `manage NotionConnector` is what opens the door and nothing else does.
 */
describe('Notion connector integration', () => {
  const TEST_ENV: Record<string, string> = {
    NOTION_API_TOKEN: 'ntn_integration_token',
    NOTION_BUG_BOARD_DATA_SOURCE_ID: DATA_SOURCE_ID,
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = {
    // The feature guard resolves entitlements through Prisma on every request,
    // and this stub replaces Prisma wholesale — without the delegate every
    // route in the suite answers 500. No rows means nothing is disabled.
    featureEntitlement: { findMany: jest.fn(() => Promise.resolve([])) },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  function buildToken(): Promise<string> {
    return jwtService.signAsync(
      { sub: 'actor-user', email: 'ops@salingjaga.test' },
      { secret: accessTokenSecret },
    );
  }

  /**
   * The role code matters as much as the permissions here: `PermissionsGuard`
   * unshifts `manage all` for SUPER_ADMIN, so a negative test written with
   * that code proves nothing about the grant.
   */
  function mockActorWithPermissions(
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [{ role: { code: roleCode, permissions: permissions.map((permission) => ({ permission })) } }],
    });
  }

  /** An administrator holding this one grant — not a super admin's catalog-wide one. */
  function mockManagePermission(): void {
    mockActorWithPermissions('ADMIN', [
      { action: 'manage', resource: 'NotionConnector', scope: 'ANY' },
    ]);
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    global.fetch = fetchMock as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    fetchMock.mockReset();
    auditServiceMock.record.mockReset();
    authRepositoryMock.findUserById.mockReset();
  });

  it('reports the connector status without calling Notion', async () => {
    mockManagePermission();
    const token = await buildToken();
    const response = await request(app.getHttpServer())
      .get(STATUS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data).toEqual({
      isConfigured: true,
      apiVersion: '2025-09-03',
      dataSourceIdLast4: '5f21',
      circuitBreakerState: 'CLOSED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the connection test against a board that matches', async () => {
    mockManagePermission();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(buildHealthyBoardBody()), { status: 200 }),
    );
    const token = await buildToken();
    const response = await request(app.getHttpServer())
      .post(TEST_CONNECTION_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data.isSuccessful).toBe(true);
    expect(response.body.data.problems).toEqual([]);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NOTION_CONNECTION_TESTED' }),
    );
  });

  it('answers 200 and names the problem when a board column was renamed', async () => {
    mockManagePermission();
    const boardBody = buildHealthyBoardBody();
    delete (boardBody.properties as Record<string, unknown>).Severity;
    fetchMock.mockResolvedValue(new Response(JSON.stringify(boardBody), { status: 200 }));
    const token = await buildToken();
    const response = await request(app.getHttpServer())
      .post(TEST_CONNECTION_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data.isSuccessful).toBe(false);
    expect(response.body.data.problems).toEqual([
      { field: 'Severity', expected: 'select', actual: 'missing' },
    ]);
  });

  it('says the board was never shared rather than failing generically', async () => {
    mockManagePermission();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ object: 'error', code: 'object_not_found' }), { status: 404 }),
    );
    const token = await buildToken();
    const response = await request(app.getHttpServer())
      .post(TEST_CONNECTION_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data.problems[0]).toEqual({
      field: 'connection',
      expected: 'the Bug Board is readable by this integration',
      actual: 'object_not_found',
    });
  });

  it('lets a super admin in through the catalog-wide grant', async () => {
    mockActorWithPermissions('SUPER_ADMIN', []);
    const token = await buildToken();
    await request(app.getHttpServer())
      .get(STATUS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('refuses an administrator who holds every BPJS grant but not this one', async () => {
    mockActorWithPermissions('ADMIN', [
      { action: 'manage', resource: 'BpjsConfig', scope: 'ANY' },
    ]);
    const token = await buildToken();
    await request(app.getHttpServer())
      .get(STATUS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get(STATUS_PATH).expect(401);
  });
});
