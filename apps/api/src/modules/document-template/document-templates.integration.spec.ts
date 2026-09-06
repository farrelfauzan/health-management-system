import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CreateDocumentTemplateRecordPayload,
  DocumentTemplateKindValue,
  DocumentTemplateVersionRecord,
  DocumentTemplateWithLatestVersionRecord,
  PublishDocumentTemplateRecordPayload,
  UpdateDocumentTemplateRecordPayload,
} from '@hms/shared-types';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { DocumentTypeRepository } from '../managed-document/repository/document-type.repository';
import { AuditService } from '../../common/audit/audit.service';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DocumentTemplateRepository } from './repository/document-template.repository';

const TEMPLATES_PATH = '/api/v1/v1/document-templates';

/**
 * `P16-T05` over the wired stack: guard, Zod pipe, sanitiser, and the
 * service rules, with persistence replaced by an in-memory fake. What the
 * database itself must uphold — version immutability under concurrent
 * writes, the one-default partial index — lives in
 * `document-template-lifecycle.database.spec.ts` against real PostgreSQL.
 */
class InMemoryDocumentTemplateRepository {
  private templates = new Map<string, DocumentTemplateWithLatestVersionRecord>();
  private versionsByTemplate = new Map<string, DocumentTemplateVersionRecord[]>();
  private nextId = 1;

  reset(): void {
    this.templates.clear();
    this.versionsByTemplate.clear();
    this.nextId = 1;
  }

  readVersions(templateId: string): DocumentTemplateVersionRecord[] {
    return this.versionsByTemplate.get(templateId) ?? [];
  }

  async listByKind(
    kind: DocumentTemplateKindValue,
  ): Promise<DocumentTemplateWithLatestVersionRecord[]> {
    return [...this.templates.values()].filter((template) => template.kind === kind);
  }

  async findById(id: string): Promise<DocumentTemplateWithLatestVersionRecord | null> {
    return this.templates.get(id) ?? null;
  }

  async createTemplate(
    payload: CreateDocumentTemplateRecordPayload,
  ): Promise<DocumentTemplateWithLatestVersionRecord> {
    const id = `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
    const record: DocumentTemplateWithLatestVersionRecord = {
      id,
      kind: payload.kind,
      name: payload.name,
      description: payload.description ?? null,
      status: 'DRAFT',
      isDefault: false,
      contentHtml: payload.contentHtml,
      settings: payload.settings,
      createdById: payload.createdById,
      createdAt: new Date(),
      updatedAt: new Date(),
      latestPublishedVersion: null,
    };
    this.templates.set(id, record);
    return record;
  }

  async updateTemplate(
    payload: UpdateDocumentTemplateRecordPayload,
  ): Promise<DocumentTemplateWithLatestVersionRecord> {
    const existing = this.templates.get(payload.id);
    if (existing === undefined) {
      throw new Error('missing template');
    }
    const updated: DocumentTemplateWithLatestVersionRecord = {
      ...existing,
      name: payload.name ?? existing.name,
      description: payload.description === undefined ? existing.description : payload.description,
      contentHtml: payload.contentHtml ?? existing.contentHtml,
      settings: payload.settings ?? existing.settings,
      updatedAt: new Date(),
    };
    this.templates.set(payload.id, updated);
    return updated;
  }

  async publishTemplate(payload: PublishDocumentTemplateRecordPayload): Promise<{
    template: DocumentTemplateWithLatestVersionRecord;
    version: DocumentTemplateVersionRecord;
  }> {
    const existing = this.templates.get(payload.templateId);
    if (existing === undefined) {
      throw new Error('missing template');
    }
    const versions = this.versionsByTemplate.get(payload.templateId) ?? [];
    const version: DocumentTemplateVersionRecord = {
      id: `00000000-0000-4000-9000-${String(this.nextId++).padStart(12, '0')}`,
      templateId: payload.templateId,
      versionNumber: versions.length + 1,
      contentHtml: existing.contentHtml,
      settings: existing.settings,
      publishedById: payload.publishedById,
      publishedAt: new Date(),
      // Null: this fake covers the *direct* publish path, which is the
      // default posture. The approval path publishes through
      // `publishFrozenVersion` and is covered by its own spec.
      approvalDecisionId: null,
    };
    versions.push(version);
    this.versionsByTemplate.set(payload.templateId, versions);
    const published: DocumentTemplateWithLatestVersionRecord = {
      ...existing,
      status: 'PUBLISHED',
      latestPublishedVersion: version,
    };
    this.templates.set(payload.templateId, published);
    return { template: published, version };
  }

  async setDefaultTemplate(
    id: string,
    kind: DocumentTemplateKindValue,
  ): Promise<DocumentTemplateWithLatestVersionRecord> {
    for (const [templateId, template] of this.templates) {
      if (template.kind === kind && template.isDefault) {
        this.templates.set(templateId, { ...template, isDefault: false });
      }
    }
    const existing = this.templates.get(id);
    if (existing === undefined) {
      throw new Error('missing template');
    }
    const updated = { ...existing, isDefault: true };
    this.templates.set(id, updated);
    return updated;
  }

  async archiveTemplate(id: string): Promise<DocumentTemplateWithLatestVersionRecord> {
    const existing = this.templates.get(id);
    if (existing === undefined) {
      throw new Error('missing template');
    }
    this.templates.delete(id);
    return { ...existing, status: 'ARCHIVED' };
  }

  async findLatestPublishedVersionByKind(): Promise<DocumentTemplateVersionRecord | null> {
    return null;
  }
}

describe('Document templates integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const fakeRepository = new InMemoryDocumentTemplateRepository();
  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };
  /**
   * `P16-T21` put this controller behind an entitlement, and `FeatureGuard`
   * resolves it through Prisma on every request — which this suite replaces
   * wholesale. Always enabled, which is the seeded default.
   */
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };
  /**
   * `P16-T32` has every template read consult the `INVOICE_TEMPLATE` approval
   * policy. No type row is the **policy-off** posture — the default a clinic
   * starts from, and the one this suite asserts E1's behaviour under.
   *
   * Both doubles override a narrow collaborator rather than widening the
   * Prisma stub, and for the same reason: it is what keeps the "nothing was
   * persisted" assertion below true rather than merely passing. Neither the
   * entitlement read nor the policy read is a persistence call this feature
   * makes — with the policy off the approval service short-circuits before it
   * touches the registry, so the preview path really does reach no
   * persistence port at all.
   */
  const documentTypeRepositoryMock = { findByCode: jest.fn(async () => null) };
  const pdfRendererMock = { render: jest.fn() };
  const objectStorageMock = {
    generateObjectKey: jest.fn(),
    uploadObject: jest.fn(),
    getSignedUrl: jest.fn(),
    getObject: jest.fn(),
    deleteObject: jest.fn(),
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

  function mockWriteCapableAdmin(): void {
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'DocumentTemplate', scope: 'ANY' },
      { action: 'write', resource: 'DocumentTemplate', scope: 'ANY' },
    ]);
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
      .overrideProvider(DocumentTypeRepository)
      .useValue(documentTypeRepositoryMock)
      .overrideProvider(DocumentTemplateRepository)
      .useValue(fakeRepository)
      .overrideProvider(PdfRendererService)
      .useValue(pdfRendererMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageMock)
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
    fakeRepository.reset();
  });

  it('refuses an unauthenticated write', async () => {
    const response = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .send({ kind: 'INVOICE', name: 'Kuitansi' });

    expect(response.status).toBe(401);
  });

  it('refuses a write from an actor holding only the read grant', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'DocumentTemplate', scope: 'ANY' },
    ]);

    const response = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'INVOICE', name: 'Kuitansi' });

    expect(response.status).toBe(403);
  });

  it('stores a sanitised body when the payload passed the client but carries a script', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();

    const response = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'INVOICE',
        name: 'Kuitansi',
        contentHtml:
          '<p>Total: <span data-hms-var="invoice.total">Rp 0</span></p><script>fetch("https://evil.example")</script>',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.contentHtml).toBe(
      '<p>Total: <span data-hms-var="invoice.total"></span></p>',
    );
    expect(response.body.data.status).toBe('DRAFT');
  });

  it('publishes, then keeps serving the template with its version summary', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();

    const created = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'INVOICE', name: 'Kuitansi', contentHtml: '<p>v1</p>' });
    const templateId = created.body.data.id;

    const published = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${templateId}/publish`)
      .set('Authorization', `Bearer ${token}`);

    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('PUBLISHED');
    expect(published.body.data.latestPublishedVersion.versionNumber).toBe(1);

    const edited = await request(app.getHttpServer())
      .patch(`${TEMPLATES_PATH}/${templateId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentHtml: '<p>v2 draft</p>' });

    expect(edited.status).toBe(200);
    // The working copy moved on; the published version's bytes did not.
    expect(edited.body.data.contentHtml).toBe('<p>v2 draft</p>');
    expect(fakeRepository.readVersions(templateId)[0]?.contentHtml).toBe('<p>v1</p>');
  });

  it('refuses publish when the draft references a token outside the registry (P16-T12)', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();

    const created = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'INVOICE',
        name: 'Salah ketik',
        contentHtml:
          '<p><span data-hms-var="patient.mrn"></span> <span data-hms-var="patient.mrnTypo"></span></p>',
      });
    const templateId = created.body.data.id;

    const published = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${templateId}/publish`)
      .set('Authorization', `Bearer ${token}`);

    expect(published.status).toBe(422);
    expect(published.body.error.code).toBe('DOCUMENT_TEMPLATE_UNKNOWN_TOKENS');
    expect(published.body.error.details).toEqual({ unknownTokens: ['patient.mrnTypo'] });
    expect(fakeRepository.readVersions(templateId)).toHaveLength(0);
  });

  it('renders a fixture preview through the sidecar without creating any document row', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();
    pdfRendererMock.render.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    objectStorageMock.generateObjectKey.mockImplementation(
      (input: { keyPrefix: string }) => `${input.keyPrefix}/preview.pdf`,
    );
    objectStorageMock.uploadObject.mockResolvedValue({ key: 'document-templates/previews/preview.pdf' });
    objectStorageMock.getSignedUrl.mockResolvedValue({
      url: 'https://objects.example/document-templates/previews/preview.pdf?sig=1',
      expiresAt: '2026-09-01T05:05:00.000Z',
    });
    const created = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'INVOICE',
        name: 'Kuitansi',
        contentHtml: '<h1><span data-hms-var="patient.fullName"></span></h1><div data-hms-var="items"></div>',
      });
    const templateId = created.body.data.id;

    const preview = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${templateId}/preview`)
      .set('Authorization', `Bearer ${token}`);

    expect(preview.status).toBe(200);
    expect(preview.body.data.url).toContain('document-templates/previews/');
    expect(preview.body.data.expiresAt).toBe('2026-09-01T05:05:00.000Z');
    expect(Array.isArray(preview.body.data.warnings)).toBe(true);
    // US-E1-04: no patient or invoice query, nothing persisted — the only
    // persistence port in this test is the Prisma mock, and it saw nothing.
    expect(Object.keys(prismaServiceMock)).toEqual(['$connect', '$disconnect']);
    expect(fakeRepository.readVersions(templateId)).toHaveLength(0);
    const [uploaded] = objectStorageMock.uploadObject.mock.calls[0] as [{ key: string }];
    expect(uploaded.key.startsWith('document-templates/previews/')).toBe(true);
  });

  it('refuses publish on a blank template and set-default before any publish', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();

    const created = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'INVOICE', name: 'Kosong' });
    const templateId = created.body.data.id;

    const publishedBlank = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${templateId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    const defaultedUnpublished = await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${templateId}/set-default`)
      .set('Authorization', `Bearer ${token}`);

    expect(publishedBlank.status).toBe(409);
    expect(defaultedUnpublished.status).toBe(409);
  });

  it('refuses to archive the default template', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();

    const created = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'INVOICE', name: 'Kuitansi', contentHtml: '<p>v1</p>' });
    const templateId = created.body.data.id;
    await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${templateId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    await request(app.getHttpServer())
      .post(`${TEMPLATES_PATH}/${templateId}/set-default`)
      .set('Authorization', `Bearer ${token}`);

    const archived = await request(app.getHttpServer())
      .delete(`${TEMPLATES_PATH}/${templateId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(archived.status).toBe(409);
  });

  it.each([
    ['an unknown kind', { kind: 'PRESCRIPTION', name: 'X' }],
    ['a blank name', { kind: 'INVOICE', name: '   ' }],
    ['unknown settings keys', { kind: 'INVOICE', name: 'X', settings: { paperSize: 'A4', rogue: 1 } }],
  ])('refuses a create with %s', async (_label, payload) => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();

    const response = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
  });

  it('refuses an empty update', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockWriteCapableAdmin();

    const created = await request(app.getHttpServer())
      .post(TEMPLATES_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'INVOICE', name: 'Kuitansi' });

    const response = await request(app.getHttpServer())
      .patch(`${TEMPLATES_PATH}/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
  });
});
