import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { buildDocxFixture } from '../../../test/fixtures/build-docx-fixture';
import { AppModule } from '../../app.module';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DocumentTemplateRepository } from './repository/document-template.repository';

const TEMPLATES_PATH = '/api/v1/document-templates';
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000001';
const STAGED_KEY = 'document-templates/imports/staged/5d0e8442-1d1a-4f9c-beb3-6fb6cfd2cf21.docx';
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * `P16-T42` over HTTP: the two routes under the guard, the staged file read
 * from storage and deleted afterwards whatever happened, a Word file turned
 * into sanitised editor HTML with chips, a forged file refused on its bytes
 * and audited — and the working copy untouched throughout, because the
 * import is a draft the author has not saved yet.
 */
describe('Document template import integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const templateRecord = {
    id: TEMPLATE_ID,
    kind: 'INVOICE' as const,
    name: 'Kuitansi',
    description: null,
    status: 'DRAFT' as const,
    isDefault: false,
    contentHtml: '<p>asli</p>',
    settings: {
      paperSize: 'A4' as const,
      orientation: 'PORTRAIT' as const,
      marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
      itemsColumns: ['item.no' as const, 'item.description' as const],
    },
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    latestPublishedVersion: null,
  };
  const repositoryMock = {
    findById: jest.fn(async (id: string) => (id === TEMPLATE_ID ? templateRecord : null)),
    updateTemplate: jest.fn(),
  };
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
  const objectStorageMock = {
    generateObjectKey: jest.fn().mockReturnValue(STAGED_KEY),
    getSignedUploadUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.example/put',
      key: STAGED_KEY,
      expiresAt: '2026-09-05T13:05:00.000Z',
      requiredHeaders: { 'Content-Type': DOCX_MIME_TYPE },
    }),
    headObject: jest.fn(),
    getObject: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue({ key: STAGED_KEY, wasDeleted: true }),
    uploadObject: jest.fn(),
    getSignedUrl: jest.fn(),
  };

  function buildToken(): Promise<string> {
    return jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );
  }

  function mockActorWithWrite(): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              { permission: { action: 'read', resource: 'DocumentTemplate', scope: 'ANY' } },
              { permission: { action: 'write', resource: 'DocumentTemplate', scope: 'ANY' } },
            ],
          },
        },
      ],
    });
  }

  function stageBytes(content: Buffer): void {
    objectStorageMock.headObject.mockResolvedValue({
      key: STAGED_KEY,
      sizeBytes: content.length,
      contentType: DOCX_MIME_TYPE,
    });
    objectStorageMock.getObject.mockResolvedValue({
      key: STAGED_KEY,
      body: content,
      contentType: DOCX_MIME_TYPE,
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
      .overrideProvider(DocumentTemplateRepository)
      .useValue(repositoryMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    objectStorageMock.generateObjectKey.mockReturnValue(STAGED_KEY);
    objectStorageMock.deleteObject.mockResolvedValue({ key: STAGED_KEY, wasDeleted: true });
  });

  it('refuses both routes to an anonymous caller', async () => {
    const upload = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/import-upload-url`)
      .send({ sizeBytes: 1024 });
    const imported = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${TEMPLATE_ID}/import`)
      .send({ stagedKey: STAGED_KEY });

    expect(upload.status).toBe(401);
    expect(imported.status).toBe(401);
  });

  it('signs one Word upload of the declared size, under the staged prefix', async () => {
    mockActorWithWrite();

    const response = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/import-upload-url`)
      .set('Authorization', `Bearer ${await buildToken()}`)
      .send({ sizeBytes: 184_320 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({ storageKey: STAGED_KEY, url: 'https://storage.example/put' }),
    );
    expect(objectStorageMock.getSignedUploadUrl).toHaveBeenCalledWith({
      key: STAGED_KEY,
      contentType: DOCX_MIME_TYPE,
      contentLengthBytes: 184_320,
    });
  });

  it('refuses an upload larger than the surface allows before signing anything', async () => {
    mockActorWithWrite();

    const response = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/import-upload-url`)
      .set('Authorization', `Bearer ${await buildToken()}`)
      .send({ sizeBytes: 6 * 1024 * 1024 });

    expect(response.status).toBe(400);
    expect(objectStorageMock.getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('converts a staged Word file into editor HTML with chips, and leaves the working copy alone', async () => {
    mockActorWithWrite();
    stageBytes(
      await buildDocxFixture({
        paragraphs: [
          'Klinik Sehat Bersama',
          'No. {{invoice.number}} · {{tanda.tangan}}',
          '{{items}}',
        ],
        includeImage: true,
      }),
    );

    const response = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${TEMPLATE_ID}/import`)
      .set('Authorization', `Bearer ${await buildToken()}`)
      .send({ stagedKey: STAGED_KEY });

    expect(response.status).toBe(200);
    expect(response.body.data.contentHtml).toContain('<h1>Klinik Sehat Bersama</h1>');
    expect(response.body.data.contentHtml).toContain('<span data-hms-var="invoice.number"></span>');
    expect(response.body.data.contentHtml).toContain('<div data-hms-var="items"></div>');
    expect(response.body.data.contentHtml).toContain('{{tanda.tangan}}');
    expect(response.body.data.contentHtml).toMatch(/<img[^>]*src="data:image\/png;base64,/);
    expect(response.body.data.warnings).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_PLACEHOLDER', detail: 'tanda.tangan' }),
    ]);
    expect(repositoryMock.updateTemplate).not.toHaveBeenCalled();
    expect(objectStorageMock.deleteObject).toHaveBeenCalledWith({ key: STAGED_KEY });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'document-template',
        resourceId: TEMPLATE_ID,
        metadata: expect.objectContaining({ event: 'TEMPLATE_IMPORTED', warningCount: 1 }),
      }),
    );
  });

  it('refuses a PDF renamed .docx on its bytes, audits it, and still removes the staged file', async () => {
    mockActorWithWrite();
    stageBytes(Buffer.from('%PDF-1.4\n1 0 obj\n'));

    const response = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${TEMPLATE_ID}/import`)
      .set('Authorization', `Bearer ${await buildToken()}`)
      .send({ stagedKey: STAGED_KEY });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Uploaded file is not a Word (.docx) document');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_UPLOAD_REJECTED',
        resource: 'document-template',
      }),
    );
    expect(objectStorageMock.deleteObject).toHaveBeenCalledWith({ key: STAGED_KEY });
  });

  it('will not read a key outside the staged import prefix', async () => {
    mockActorWithWrite();

    const response = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${TEMPLATE_ID}/import`)
      .set('Authorization', `Bearer ${await buildToken()}`)
      .send({ stagedKey: 'invoices/2026/some-other-object.pdf' });

    expect(response.status).toBe(400);
    expect(objectStorageMock.getObject).not.toHaveBeenCalled();
  });

  it('answers not-found for a template that does not exist', async () => {
    mockActorWithWrite();

    const response = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/00000000-0000-4000-8000-000000000099/import`)
      .set('Authorization', `Bearer ${await buildToken()}`)
      .send({ stagedKey: STAGED_KEY });

    expect(response.status).toBe(404);
  });
});
