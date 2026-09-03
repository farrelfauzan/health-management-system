import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';

/**
 * `P16-T34` over HTTP, with the real controllers, the real global
 * `PermissionsGuard`, the real Zod pipe and the real services.
 *
 * The load-bearing case is US-E3-05's second half: **a named admin can open a
 * shared document, and a second admin — holding every `:any` key this product
 * defines — gets a 404 on the same id.** Being an administrator grants
 * nothing here. That is the whole claim of the epic, and it is asserted at
 * the HTTP boundary rather than in a service, because a route that quietly
 * resolved would be the failure and a service spec cannot see routes.
 *
 * The second group is the shape of a recipient's capability (FR-E3-14). It is
 * proven by absence: a recipient's PATCH and DELETE go to the owner-scoped
 * controller, which queries by owner, so a shared document is simply not in
 * the set it sees. There is no refusal to test — there is nothing to refuse.
 *
 * A `403` would be a failure here as much as a `200`: distinguishing
 * "forbidden" from "not found" would confirm that a given document id is
 * real, which is itself a disclosure about someone else's vault.
 */
describe('Vault document sharing integration', () => {
  const TEST_ENV: Record<string, string> = {
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
    LICENCE_EXPIRY_REMINDERS_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const OWNER_USER_ID = '22222222-2222-4222-8222-222222222222';
  const NAMED_ADMIN_USER_ID = '77777777-7777-4777-8777-777777777777';
  const OTHER_ADMIN_USER_ID = '88888888-8888-4888-8888-888888888888';
  const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
  const SHARE_ID = '99999999-9999-4999-8999-999999999999';
  const VAULT_KEY = 'documents/vault/doctor/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let documentRows: Array<Record<string, unknown>> = [];
  let shareRows: Array<Record<string, unknown>> = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const objectStorageServiceMock = {
    getSignedUrl: jest.fn(() =>
      Promise.resolve({ url: 'https://storage.test/get', expiresAt: '2026-09-03T09:05:00.000Z' }),
    ),
  };

  const USER_DIRECTORY: Record<string, { email: string; isActive: boolean; canReadVault: boolean }> =
    {
      [OWNER_USER_ID]: { email: 'doctor@hms.test', isActive: true, canReadVault: true },
      [NAMED_ADMIN_USER_ID]: { email: 'admin@hms.test', isActive: true, canReadVault: true },
      [OTHER_ADMIN_USER_ID]: { email: 'other-admin@hms.test', isActive: true, canReadVault: true },
    };

  /**
   * Honours `documentId`, `granteeId`, `revokedAt` and the expiry clause
   * exactly as Postgres would. That fidelity is the point: a stub that
   * ignored any of them would let the isolation cases below pass against a
   * repository that had stopped filtering.
   */
  function matchShares(where: Record<string, unknown>): Array<Record<string, unknown>> {
    const now = new Date();
    return shareRows.filter((row) => {
      if (where.id !== undefined && row.id !== where.id) {
        return false;
      }
      if (where.documentId !== undefined && row.documentId !== where.documentId) {
        return false;
      }
      if (where.granteeId !== undefined && row.granteeId !== where.granteeId) {
        return false;
      }
      if (where.revokedAt === null && row.revokedAt !== null) {
        return false;
      }
      if (where.OR !== undefined && row.expiresAt !== null) {
        if ((row.expiresAt as Date).getTime() <= now.getTime()) {
          return false;
        }
      }
      if (where.document !== undefined) {
        const documentWhere = where.document as Record<string, unknown>;
        const document = documentRows.find((candidate) => candidate.id === row.documentId);
        if (document === undefined) {
          return false;
        }
        if (documentWhere.ownerId !== undefined && document.ownerId !== documentWhere.ownerId) {
          return false;
        }
        if (documentWhere.purpose !== undefined && document.purpose !== documentWhere.purpose) {
          return false;
        }
      }
      return true;
    });
  }

  function decorateShare(row: Record<string, unknown>): Record<string, unknown> {
    const grantee = USER_DIRECTORY[row.granteeId as string];
    const grantor = USER_DIRECTORY[row.grantedById as string];
    const document = documentRows.find((candidate) => candidate.id === row.documentId);
    return {
      ...row,
      grantee: { email: grantee?.email, isActive: grantee?.isActive ?? false, deletedAt: null },
      grantedBy: { email: grantor?.email },
      document: {
        title: document?.title,
        mimeType: document?.mimeType,
        sizeBytes: document?.sizeBytes,
        storageKey: document?.storageKey,
      },
    };
  }

  const prismaServiceMock: Record<string, unknown> = {
    featureEntitlement: { findMany: jest.fn(() => Promise.resolve([])) },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((run: (tx: unknown) => unknown): unknown => run(prismaServiceMock)),
    document: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const row = documentRows.find(
          (candidate) =>
            candidate.deletedAt === null &&
            (where.id === undefined || candidate.id === where.id) &&
            (where.ownerId === undefined || candidate.ownerId === where.ownerId) &&
            (where.purpose === undefined || candidate.purpose === where.purpose),
        );
        return Promise.resolve(row === undefined ? null : { ...row });
      }),
    },
    user: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const entry = USER_DIRECTORY[where.id as string];
        if (entry === undefined || !entry.isActive || !entry.canReadVault) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id: where.id });
      }),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    vaultDocumentShare: {
      upsert: jest.fn(
        ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = shareRows.find(
            (row) => row.documentId === create.documentId && row.granteeId === create.granteeId,
          );
          if (existing !== undefined) {
            Object.assign(existing, update);
            return Promise.resolve(decorateShare(existing));
          }
          const row = {
            id: SHARE_ID,
            revokedAt: null,
            lastAccessedAt: null,
            accessCount: 0,
            createdAt: new Date('2026-09-03T09:10:00.000Z'),
            ...create,
          };
          shareRows.push(row);
          return Promise.resolve(decorateShare(row));
        },
      ),
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(matchShares(where).map((row) => decorateShare(row))),
      ),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const row = matchShares(where)[0];
        return Promise.resolve(row === undefined ? null : decorateShare(row));
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const row = shareRows.find((candidate) => candidate.id === where.id);
        return Promise.resolve(row === undefined ? null : { ...row });
      }),
      updateMany: jest.fn(
        ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const rows = matchShares(where);
          for (const row of rows) {
            Object.assign(row, data);
          }
          return Promise.resolve({ count: rows.length });
        },
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = shareRows.find((candidate) => candidate.id === where.id);
        if (row === undefined) {
          return Promise.reject(new Error('not found'));
        }
        const increment = (data.accessCount as { increment?: number } | undefined)?.increment ?? 0;
        row.accessCount = (row.accessCount as number) + increment;
        row.lastAccessedAt = data.lastAccessedAt ?? row.lastAccessedAt;
        return Promise.resolve({ accessCount: row.accessCount });
      }),
      count: jest.fn(() => Promise.resolve(shareRows.length)),
    },
    notification: {
      create: jest.fn(() =>
        Promise.resolve({
          id: 'notification-1',
          userId: OWNER_USER_ID,
          type: 'VAULT_DOCUMENT_SHARED',
          titleKey: 'a',
          bodyKey: 'b',
          params: {},
          href: null,
          readAt: null,
          createdAt: new Date(),
        }),
      ),
    },
  };

  function buildVaultRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: DOCUMENT_ID,
      ownerType: 'DOCTOR',
      ownerId: OWNER_USER_ID,
      purpose: 'DOCTOR_VAULT',
      title: 'STR Dokter Umum',
      storageKey: VAULT_KEY,
      mimeType: 'application/pdf',
      sizeBytes: 148480,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'NOT_APPLICABLE',
      uploadedById: OWNER_USER_ID,
      vaultCategory: 'REGISTRATION_LICENCE',
      referenceNumber: 'STR-EXAMPLE-0000',
      issuedAt: new Date('2024-03-14T00:00:00.000Z'),
      expiresAt: new Date('2029-03-14T00:00:00.000Z'),
      createdAt: new Date('2026-09-03T09:00:00.000Z'),
      updatedAt: new Date('2026-09-03T09:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    };
  }

  function buildShareRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: SHARE_ID,
      documentId: DOCUMENT_ID,
      granteeId: NAMED_ADMIN_USER_ID,
      grantedById: OWNER_USER_ID,
      expiresAt: null,
      revokedAt: null,
      lastAccessedAt: null,
      accessCount: 0,
      createdAt: new Date('2026-09-03T09:10:00.000Z'),
      ...overrides,
    };
  }

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: accessTokenSecret });
  }

  function mockActor(userId: string, roleCode: string): void {
    const vaultGrants = ['read', 'write', 'share'].map((action) => ({
      permission: { action, resource: 'VaultDocument', scope: 'OWN' },
    }));
    // Every `:any` key an administrator plausibly holds over documents. The
    // point of the isolation cases is that none of them reaches a vault.
    const adminGrants =
      roleCode === 'ADMIN'
        ? [
            { permission: { action: 'read', resource: 'Document', scope: 'ANY' } },
            { permission: { action: 'write', resource: 'Document', scope: 'ANY' } },
            { permission: { action: 'read', resource: 'PatientDocument', scope: 'ANY' } },
            { permission: { action: 'read', resource: 'User', scope: 'ANY' } },
          ]
        : [];
    authRepositoryMock.findUserById.mockResolvedValue({
      id: userId,
      roles: [{ role: { code: roleCode, permissions: [...vaultGrants, ...adminGrants] } }],
    });
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    accessTokenSecret =
      moduleRef.get(ConfigService).get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret';
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    documentRows = [buildVaultRow()];
    shareRows = [];
    jest.clearAllMocks();
  });

  it('shares one document with one named person and audits the grant', async () => {
    mockActor(OWNER_USER_ID, 'DOCTOR');
    const token = await buildToken(OWNER_USER_ID, 'doctor@hms.test');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/me/vault-documents/${DOCUMENT_ID}/shares`)
      .set('Authorization', `Bearer ${token}`)
      .send({ granteeId: NAMED_ADMIN_USER_ID })
      .expect(201);

    expect(response.body.data.granteeEmail).toBe('admin@hms.test');
    expect(response.body.data.isLive).toBe(true);
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VAULT_DOCUMENT_SHARE_GRANTED' }),
    );
  });

  it('lets the named admin open it, and reports it missing for a second admin holding every ANY key', async () => {
    shareRows = [buildShareRow()];

    mockActor(NAMED_ADMIN_USER_ID, 'ADMIN');
    const namedToken = await buildToken(NAMED_ADMIN_USER_ID, 'admin@hms.test');
    await request(app.getHttpServer())
      .get(`/api/v1/shared-with-me/documents/${DOCUMENT_ID}/download`)
      .set('Authorization', `Bearer ${namedToken}`)
      .expect(200);

    mockActor(OTHER_ADMIN_USER_ID, 'ADMIN');
    const otherToken = await buildToken(OTHER_ADMIN_USER_ID, 'other-admin@hms.test');
    // 404 rather than 403. Distinguishing the two would confirm the id is
    // real, which is itself a disclosure about someone else's vault.
    await request(app.getHttpServer())
      .get(`/api/v1/shared-with-me/documents/${DOCUMENT_ID}/download`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('shows the named admin only that one document, and nothing else from the vault', async () => {
    documentRows.push(
      buildVaultRow({
        id: '55555555-5555-4555-8555-555555555555',
        title: 'KTP',
        storageKey: 'documents/vault/doctor/other.pdf',
      }),
    );
    shareRows = [buildShareRow()];
    mockActor(NAMED_ADMIN_USER_ID, 'ADMIN');
    const token = await buildToken(NAMED_ADMIN_USER_ID, 'admin@hms.test');

    const response = await request(app.getHttpServer())
      .get('/api/v1/shared-with-me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(DOCUMENT_ID);
    // Nothing about how the owner files their own paperwork travels with a
    // shared document — those are their private notes to themselves.
    expect(response.body.data[0]).not.toHaveProperty('vaultCategory');
    expect(response.body.data[0]).not.toHaveProperty('referenceNumber');
  });

  it('gives a recipient no rename, delete or re-share of a document shared with them', async () => {
    shareRows = [buildShareRow()];
    mockActor(NAMED_ADMIN_USER_ID, 'ADMIN');
    const token = await buildToken(NAMED_ADMIN_USER_ID, 'admin@hms.test');

    // These reach the owner-scoped controller, which queries by owner. The
    // recipient is not the owner, so the document is not in the set it sees —
    // there is no capability to refuse, only nothing to find.
    await request(app.getHttpServer())
      .patch(`/api/v1/me/vault-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed by the recipient' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/me/vault-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/me/vault-documents/${DOCUMENT_ID}/shares`)
      .set('Authorization', `Bearer ${token}`)
      .send({ granteeId: OTHER_ADMIN_USER_ID })
      .expect(404);
  });

  it('refuses the recipient the moment the owner revokes, with no window', async () => {
    shareRows = [buildShareRow()];

    mockActor(OWNER_USER_ID, 'DOCTOR');
    const ownerToken = await buildToken(OWNER_USER_ID, 'doctor@hms.test');
    await request(app.getHttpServer())
      .delete(`/api/v1/me/vault-documents/${DOCUMENT_ID}/shares/${SHARE_ID}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    mockActor(NAMED_ADMIN_USER_ID, 'ADMIN');
    const adminToken = await buildToken(NAMED_ADMIN_USER_ID, 'admin@hms.test');
    await request(app.getHttpServer())
      .get(`/api/v1/shared-with-me/documents/${DOCUMENT_ID}/download`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VAULT_DOCUMENT_SHARE_REVOKED' }),
    );
  });

  it('drops an expired share from the recipient’s list with no action from the owner', async () => {
    shareRows = [buildShareRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })];
    mockActor(NAMED_ADMIN_USER_ID, 'ADMIN');
    const token = await buildToken(NAMED_ADMIN_USER_ID, 'admin@hms.test');

    const response = await request(app.getHttpServer())
      .get('/api/v1/shared-with-me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('refuses the recipient lookup below the minimum search length', async () => {
    mockActor(OWNER_USER_ID, 'DOCTOR');
    const token = await buildToken(OWNER_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .get('/api/v1/me/vault-documents/share-recipients?search=ab')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('takes no owner id anywhere in the sharing surface', async () => {
    mockActor(OWNER_USER_ID, 'DOCTOR');
    const token = await buildToken(OWNER_USER_ID, 'doctor@hms.test');

    // An owner smuggled into the body is stripped by the Zod schema, and the
    // share is still written against the authenticated caller's document —
    // FR-E3-02 survives sharing intact.
    const response = await request(app.getHttpServer())
      .post(`/api/v1/me/vault-documents/${DOCUMENT_ID}/shares`)
      .set('Authorization', `Bearer ${token}`)
      .send({ granteeId: NAMED_ADMIN_USER_ID, ownerId: OTHER_ADMIN_USER_ID })
      .expect(201);

    expect(response.body.data.documentId).toBe(DOCUMENT_ID);
    expect(shareRows[0]?.grantedById).toBe(OWNER_USER_ID);
  });
});
