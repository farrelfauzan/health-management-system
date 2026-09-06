import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CreateManagedDocumentRecordPayload,
  DocumentTypeRecord,
  ListManagedDocumentsParams,
  ManagedDocumentAccessContext,
  ManagedDocumentPage,
  ManagedDocumentRecord,
  UpdateManagedDocumentRecordPayload,
} from '@hms/shared-types';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DocumentTypeRepository } from './repository/document-type.repository';
import { ManagedDocumentRepository } from './repository/managed-document.repository';

const DOCUMENTS_PATH = '/api/v1/v1/documents';
const TYPE_ID = '00000000-0000-4000-8000-00000000aaaa';
const OWNER_USER_ID = '00000000-0000-4000-8000-00000000000a';
const OTHER_USER_ID = '00000000-0000-4000-8000-00000000000b';

type Permission = { action: string; resource: string; scope: 'ANY' | 'OWN' };

const REGISTRY_READ: Permission = { action: 'read', resource: 'ManagedDocument', scope: 'ANY' };
const REGISTRY_WRITE: Permission = { action: 'write', resource: 'ManagedDocument', scope: 'ANY' };
const INVOICE_READ: Permission = { action: 'read', resource: 'Invoice', scope: 'ANY' };

/**
 * `P16-T28` over the wired stack: guard, strict Zod pipe, the access
 * resolver reading the caller's grants, and the service rules, with
 * persistence replaced by an in-memory fake that applies the same per-row
 * predicate the repository folds into its `where`. The database's own
 * guarantees — the CHECKs, and the predicate as SQL — are proven in
 * `managed-document.database.spec.ts` against real PostgreSQL.
 *
 * The load-bearing case is FR-E5-04: **the same list call returns different
 * sets and different counts to callers with different entitlements**, and a
 * row outside a caller's reach is a 404 on the detail, not a 403.
 */
class InMemoryManagedDocumentRepository {
  private readonly documents = new Map<string, ManagedDocumentRecord>();
  private nextId = 1;

  reset(): void {
    this.documents.clear();
    this.nextId = 1;
  }

  seed(overrides: Partial<ManagedDocumentRecord>): ManagedDocumentRecord {
    const record = this.buildRecord({
      typeId: TYPE_ID,
      status: 'DRAFT',
      title: 'seeded',
      documentNumber: null,
      contentHtml: '<p>x</p>',
      storageKey: null,
      storageMimeType: null,
      storageSizeBytes: null,
      patientId: null,
      doctorId: null,
      subjectTemplateId: null,
      subjectDocumentId: null,
      subjectInvoiceId: null,
      draftedById: OWNER_USER_ID,
      issuedAt: null,
      ...overrides,
    });
    this.documents.set(record.id, record);
    return record;
  }

  async listDocuments(params: ListManagedDocumentsParams): Promise<ManagedDocumentPage> {
    const visible = [...this.documents.values()].filter(
      (record) =>
        isVisible(record, params.access) &&
        (params.search === undefined ||
          record.title.toLowerCase().includes(params.search.toLowerCase())),
    );
    return { items: visible, total: visible.length };
  }

  async listDocumentsForExport(
    params: Omit<ListManagedDocumentsParams, 'page' | 'limit'>,
  ): Promise<ManagedDocumentRecord[]> {
    return (await this.listDocuments({ ...params, page: 1, limit: 100 })).items;
  }

  async findVisibleById(
    id: string,
    access: ManagedDocumentAccessContext,
  ): Promise<ManagedDocumentRecord | null> {
    const record = this.documents.get(id);
    return record !== undefined && isVisible(record, access) ? record : null;
  }

  async createDocument(
    payload: CreateManagedDocumentRecordPayload,
  ): Promise<ManagedDocumentRecord> {
    const record = this.buildRecord(payload);
    this.documents.set(record.id, record);
    return record;
  }

  async updateDocument(
    payload: UpdateManagedDocumentRecordPayload,
  ): Promise<ManagedDocumentRecord> {
    const existing = this.documents.get(payload.id);
    if (existing === undefined) {
      throw new Error('missing document');
    }
    const { id, ...changes } = payload;
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const updated = { ...existing, ...defined, id, updatedAt: new Date() };
    this.documents.set(id, updated);
    return updated;
  }

  async listHistory(): Promise<[]> {
    return [];
  }

  async findPatientById(): Promise<null> {
    return null;
  }

  async findDoctorById(): Promise<null> {
    return null;
  }

  private buildRecord(
    payload: CreateManagedDocumentRecordPayload & Partial<ManagedDocumentRecord>,
  ): ManagedDocumentRecord {
    return {
      id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`,
      typeId: payload.typeId,
      type: {
        id: payload.typeId,
        code: 'LETTER',
        name: 'Surat',
        behavior: 'GENERIC',
        contentMode: 'EITHER',
        requiresPatient: false,
        requiresDoctor: false,
        isActive: true,
      },
      status: payload.status,
      title: payload.title,
      documentNumber: payload.documentNumber,
      contentHtml: payload.contentHtml,
      storageKey: payload.storageKey,
      storageMimeType: payload.storageMimeType,
      storageSizeBytes: payload.storageSizeBytes,
      patient: null,
      doctor: null,
      subjectTemplateId: payload.subjectTemplateId,
      subjectDocumentId: payload.subjectDocumentId,
      subjectInvoiceId: payload.subjectInvoiceId,
      subjectDocument: payload.subjectDocument ?? null,
      draftedBy: { id: payload.draftedById, email: 'drafter@hms.local' },
      issuedAt: payload.issuedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/** The repository's predicate, restated over records for the fake. */
function isVisible(record: ManagedDocumentRecord, access: ManagedDocumentAccessContext): boolean {
  if (record.subjectInvoiceId !== null && !access.canReadInvoices) {
    return false;
  }
  if (record.subjectTemplateId !== null && !access.canReadTemplates) {
    return false;
  }
  if (record.subjectDocumentId === null || record.subjectDocument === null) {
    return true;
  }
  const { purpose, ownerId } = record.subjectDocument;
  if (purpose === 'DOCTOR_VAULT' || purpose === 'PERSONAL_KNOWLEDGE_BASE') {
    return ownerId === access.userId;
  }
  return purpose === 'PATIENT_CLINICAL'
    ? access.canReadPatientDocuments
    : access.canReadClinicCorpus;
}

describe('Documents registry integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const fakeRepository = new InMemoryManagedDocumentRepository();
  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };
  const objectStorageMock = { headObject: jest.fn() };
  const activeType: DocumentTypeRecord = {
    id: TYPE_ID,
    code: 'LETTER',
    name: 'Surat',
    description: null,
    behavior: 'GENERIC',
    isSystem: true,
    isApprovalRequired: true,
    allowSelfApproval: false,
    requiredApprovals: 1,
    requiresPatient: false,
    requiresDoctor: false,
    contentMode: 'EITHER',
    isActive: true,
    sortOrder: 0,
    documentCount: 0,
    defaultApprovers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const documentTypeRepositoryMock = {
    findById: jest.fn(async (id: string) => (id === TYPE_ID ? activeType : null)),
  };

  function buildToken(sub: string): Promise<string> {
    return jwtService.signAsync(
      { sub, email: `${sub}@hms.local` },
      { secret: 'dev-access-secret' },
    );
  }

  function mockActor(userId: string, permissions: Permission[]): void {
    authRepositoryMock.findUserById.mockImplementation(async (id: string) =>
      id === userId
        ? {
            id,
            roles: [
              {
                role: {
                  code: 'STAFF',
                  permissions: permissions.map((permission) => ({ permission })),
                },
              },
            ],
          }
        : null,
    );
  }

  async function listAs(userId: string, permissions: Permission[]) {
    mockActor(userId, permissions);
    const token = await buildToken(userId);
    return request(app.getHttpServer())
      .get(`${DOCUMENTS_PATH}?q=seeded`)
      .set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageMock)
      .overrideProvider(DocumentTypeRepository)
      .useValue(documentTypeRepositoryMock)
      .overrideProvider(ManagedDocumentRepository)
      .useValue(fakeRepository)
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
    fakeRepository.seed({ title: 'seeded plain letter' });
    fakeRepository.seed({
      title: 'seeded patient bill',
      status: 'ISSUED',
      subjectInvoiceId: '00000000-0000-4000-8000-0000000000c1',
    });
    fakeRepository.seed({
      title: 'seeded vault governed',
      subjectDocumentId: '00000000-0000-4000-8000-0000000000d1',
      subjectDocument: { purpose: 'DOCTOR_VAULT', ownerId: OWNER_USER_ID },
    });
  });

  it('refuses the registry to an actor without the read grant', async () => {
    const response = await listAs(OTHER_USER_ID, [REGISTRY_WRITE]);

    expect(response.status).toBe(403);
  });

  it('returns different sets and counts to callers with different entitlements', async () => {
    const asClerk = await listAs(OTHER_USER_ID, [REGISTRY_READ]);
    const asCashier = await listAs(OTHER_USER_ID, [REGISTRY_READ, INVOICE_READ]);
    const asOwner = await listAs(OWNER_USER_ID, [REGISTRY_READ]);

    expect(asClerk.status).toBe(200);
    expect(asClerk.body.data.items.map((item: { title: string }) => item.title)).toEqual([
      'seeded plain letter',
    ]);
    expect(asClerk.body.data.meta.total).toBe(1);
    expect(asCashier.body.data.items.map((item: { title: string }) => item.title).sort()).toEqual([
      'seeded patient bill',
      'seeded plain letter',
    ]);
    expect(asCashier.body.data.meta.total).toBe(2);
    expect(asOwner.body.data.items.map((item: { title: string }) => item.title).sort()).toEqual([
      'seeded plain letter',
      'seeded vault governed',
    ]);
  });

  it('answers 404, never 403, for a row outside the caller’s reach', async () => {
    const seeded = fakeRepository.seed({
      title: 'seeded other vault',
      subjectDocumentId: '00000000-0000-4000-8000-0000000000d2',
      subjectDocument: { purpose: 'DOCTOR_VAULT', ownerId: OWNER_USER_ID },
    });
    mockActor(OTHER_USER_ID, [REGISTRY_READ]);
    const token = await buildToken(OTHER_USER_ID);

    const response = await request(app.getHttpServer())
      .get(`${DOCUMENTS_PATH}/${seeded.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it('refuses a body naming both drafted and uploaded content', async () => {
    mockActor(OTHER_USER_ID, [REGISTRY_READ, REGISTRY_WRITE]);
    const token = await buildToken(OTHER_USER_ID);

    const response = await request(app.getHttpServer())
      .post(DOCUMENTS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        typeId: TYPE_ID,
        title: 'both',
        contentHtml: '<p>x</p>',
        storageKey: 'documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
      });

    expect(response.status).toBe(400);
  });

  it('rejects a request that tries to set status or a subject link', async () => {
    mockActor(OTHER_USER_ID, [REGISTRY_READ, REGISTRY_WRITE]);
    const token = await buildToken(OTHER_USER_ID);

    const response = await request(app.getHttpServer())
      .post(DOCUMENTS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        typeId: TYPE_ID,
        title: 'sneaky',
        subjectDocumentId: '00000000-0000-4000-8000-0000000000d1',
        status: 'ISSUED',
      });

    expect(response.status).toBe(400);
  });

  it('drafts a document with sanitised HTML, then lists it without the body', async () => {
    mockActor(OTHER_USER_ID, [REGISTRY_READ, REGISTRY_WRITE]);
    const token = await buildToken(OTHER_USER_ID);

    const created = await request(app.getHttpServer())
      .post(DOCUMENTS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        typeId: TYPE_ID,
        title: 'seeded consent draft',
        contentHtml: '<p>Setuju</p><script>alert(1)</script>',
      });
    const listed = await request(app.getHttpServer())
      .get(`${DOCUMENTS_PATH}?q=consent`)
      .set('Authorization', `Bearer ${token}`);

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      status: 'DRAFT',
      contentHtml: '<p>Setuju</p>',
      subject: null,
    });
    expect(listed.body.data.items).toHaveLength(1);
    expect(listed.body.data.items[0]).not.toHaveProperty('contentHtml');
    expect(listed.body.data.items[0].hasContentHtml).toBe(true);
  });

  it('exports the visible rows as CSV with metadata only', async () => {
    mockActor(OTHER_USER_ID, [REGISTRY_READ]);
    const token = await buildToken(OTHER_USER_ID);

    const response = await request(app.getHttpServer())
      .get(`${DOCUMENTS_PATH}/export?q=seeded`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('seeded plain letter');
    expect(response.text).not.toContain('seeded patient bill');
    expect(response.text).not.toContain('<p>');
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }),
    );
  });
});
