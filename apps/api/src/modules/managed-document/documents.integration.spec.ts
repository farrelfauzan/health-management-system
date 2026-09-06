import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CreateDocumentApprovalRequestPayload,
  CreateManagedDocumentRecordPayload,
  DocumentApprovalPendingCounts,
  DocumentApprovalRequestRecord,
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
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DocumentApprovalRepository } from './repository/document-approval.repository';
import { DocumentTypeRepository } from './repository/document-type.repository';
import { ManagedDocumentRepository } from './repository/managed-document.repository';

const DOCUMENTS_PATH = '/api/v1/v1/documents';
const TYPE_ID = '00000000-0000-4000-8000-00000000aaaa';
const AGREEMENT_TYPE_ID = '00000000-0000-4000-8000-00000000aaab';
const POLICY_TYPE_ID = '00000000-0000-4000-8000-00000000aaac';
const UPLOAD_ONLY_TYPE_ID = '00000000-0000-4000-8000-00000000aaad';
const PATIENT_ID = '00000000-0000-4000-8000-00000000eee1';
const DOCTOR_ID = '00000000-0000-4000-8000-00000000eee2';
const OWNER_USER_ID = '00000000-0000-4000-8000-00000000000a';
const OTHER_USER_ID = '00000000-0000-4000-8000-00000000000b';

type Permission = { action: string; resource: string; scope: 'ANY' | 'OWN' };

const REGISTRY_READ: Permission = { action: 'read', resource: 'ManagedDocument', scope: 'ANY' };
const REGISTRY_WRITE: Permission = { action: 'write', resource: 'ManagedDocument', scope: 'ANY' };
const INVOICE_READ: Permission = { action: 'read', resource: 'Invoice', scope: 'ANY' };
const APPROVAL_DECIDE: Permission = {
  action: 'decide',
  resource: 'DocumentApproval',
  scope: 'ANY',
};
const APPROVAL_TYPE_ID = '00000000-0000-4000-8000-00000000aaae';
const APPROVER_USER_ID = '00000000-0000-4000-8000-00000000000c';

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
          record.title.toLowerCase().includes(params.search.toLowerCase())) &&
        // `undefined` means no approver filter; an empty array means one that
        // matched nothing, and must narrow to nothing rather than widen.
        (params.awaitingApprovalDocumentIds === undefined ||
          params.awaitingApprovalDocumentIds.includes(record.id)),
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

  async findPatientById(id: string): Promise<{ id: string } | null> {
    return id === PATIENT_ID ? { id } : null;
  }

  async findDoctorById(id: string): Promise<{ id: string } | null> {
    return id === DOCTOR_ID ? { id } : null;
  }

  async transitionDocument(payload: {
    id: string;
    status: ManagedDocumentRecord['status'];
    issuedAt?: Date | null;
  }): Promise<ManagedDocumentRecord> {
    const existing = this.documents.get(payload.id);
    if (existing === undefined) {
      throw new Error('not found');
    }
    const next: ManagedDocumentRecord = {
      ...existing,
      status: payload.status,
      issuedAt: payload.issuedAt === undefined ? existing.issuedAt : payload.issuedAt,
    };
    this.documents.set(next.id, next);
    return next;
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
        isApprovalRequired: false,
        allowSelfApproval: false,
        requiredApprovals: 1,
        ...(payload.type ?? {}),
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

/**
 * The approval rounds `P16-T29` adds, in memory. It keeps exactly the two
 * behaviours the wired-stack cases turn on: at most one open round per
 * document (the partial unique index, proven for real in
 * `document-approval.database.spec.ts`), and a decision that resolves the
 * round issuing the **frozen** payload rather than the live row.
 */
class InMemoryDocumentApprovalRepository {
  private readonly rounds = new Map<string, DocumentApprovalRequestRecord>();
  private nextId = 1;

  constructor(private readonly registry: InMemoryManagedDocumentRepository) {}

  reset(): void {
    this.rounds.clear();
    this.nextId = 1;
  }

  async createRequest(
    payload: CreateDocumentApprovalRequestPayload,
  ): Promise<DocumentApprovalRequestRecord> {
    if ((await this.findPendingRequestForDocument(payload.documentId)) !== null) {
      throw new Error('one pending round per document');
    }
    const round: DocumentApprovalRequestRecord = {
      id: `00000000-0000-4000-8000-1000${String(this.nextId++).padStart(8, '0')}`,
      documentId: payload.documentId,
      status: 'PENDING',
      frozenPayload: payload.frozenPayload,
      submittedBy: { id: payload.submittedById, email: `${payload.submittedById}@hms.local` },
      submittedAt: new Date(),
      dueAt: payload.dueAt,
      resolvedAt: null,
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      approvers: payload.approverIds.map((approverId) => ({
        approverId,
        email: `${approverId}@hms.local`,
        isEligible: true,
      })),
      decisions: [],
    };
    this.rounds.set(round.id, round);
    return round;
  }

  async findRequestById(id: string): Promise<DocumentApprovalRequestRecord | null> {
    return this.rounds.get(id) ?? null;
  }

  async findPendingRequestForDocument(
    documentId: string,
  ): Promise<DocumentApprovalRequestRecord | null> {
    return (
      [...this.rounds.values()].find(
        (round) => round.documentId === documentId && round.status === 'PENDING',
      ) ?? null
    );
  }

  async listRequestsForDocument(documentId: string): Promise<DocumentApprovalRequestRecord[]> {
    return [...this.rounds.values()].filter((round) => round.documentId === documentId);
  }

  async findPendingRequestsForDocuments(
    documentIds: readonly string[],
  ): Promise<Map<string, DocumentApprovalRequestRecord>> {
    const entries = [...this.rounds.values()]
      .filter((round) => round.status === 'PENDING' && documentIds.includes(round.documentId))
      .map((round): [string, DocumentApprovalRequestRecord] => [round.documentId, round]);
    return new Map(entries);
  }

  async findDocumentIdsAwaitingApprover(approverId: string): Promise<string[]> {
    return [...this.rounds.values()]
      .filter(
        (round) =>
          round.status === 'PENDING' &&
          round.approvers.some((approver) => approver.approverId === approverId),
      )
      .map((round) => round.documentId);
  }

  async listQueue(params: { approverId?: string; page: number; limit: number }) {
    const items = [...this.rounds.values()]
      .filter((round) => round.status === 'PENDING')
      .filter(
        (round) =>
          params.approverId === undefined ||
          round.approvers.some((approver) => approver.approverId === params.approverId),
      )
      .map((round) => ({
        round,
        document: {
          id: round.documentId,
          title: 'seeded',
          documentNumber: null,
          type: {
            id: APPROVAL_TYPE_ID,
            code: 'LETTER',
            name: 'Surat',
            behavior: 'GENERIC' as const,
            contentMode: 'EITHER' as const,
            requiredApprovals: 1,
          },
        },
      }));
    return { items, total: items.length };
  }

  async countPendingForApprover(approverId: string): Promise<DocumentApprovalPendingCounts> {
    const queue = await this.listQueue({ approverId, page: 1, limit: 100 });
    return { pending: queue.total, overdue: 0 };
  }

  async claimDecision(params: {
    requestId: string;
    approverId: string;
    isApproved: boolean;
    reason: string | null;
    requiredApprovals: number;
    frozenContent: { documentId: string; contentHtml: string | null; title: string };
  }): Promise<{ isResolved: boolean; approvalCount: number } | null> {
    const round = this.rounds.get(params.requestId);
    if (round === undefined || round.status !== 'PENDING') {
      return null;
    }
    round.decisions.push({
      id: `decision-${round.decisions.length + 1}`,
      approverId: params.approverId,
      approverEmail: `${params.approverId}@hms.local`,
      isApproved: params.isApproved,
      reason: params.reason,
      decidedAt: new Date(),
    });
    if (!params.isApproved) {
      round.status = 'REJECTED';
      round.resolvedAt = new Date();
      await this.registry.transitionDocument({ id: round.documentId, status: 'DRAFT' });
      return { isResolved: true, approvalCount: 0 };
    }
    const approvalCount = round.decisions.filter((decision) => decision.isApproved).length;
    const isResolved = approvalCount >= params.requiredApprovals;
    if (isResolved) {
      round.status = 'APPROVED';
      round.resolvedAt = new Date();
      await this.registry.updateDocument({
        id: round.documentId,
        title: params.frozenContent.title,
        contentHtml: params.frozenContent.contentHtml,
      });
      await this.registry.transitionDocument({
        id: round.documentId,
        status: 'ISSUED',
        issuedAt: new Date(),
      });
    }
    return { isResolved, approvalCount };
  }

  async resolveWithoutDecision(
    requestId: string,
    status: 'WITHDRAWN' | 'SUPERSEDED',
  ): Promise<boolean> {
    const round = this.rounds.get(requestId);
    if (round === undefined || round.status !== 'PENDING') {
      return false;
    }
    round.status = status;
    round.resolvedAt = new Date();
    return true;
  }

  async supersedePendingForDocument(documentId: string): Promise<number> {
    const round = await this.findPendingRequestForDocument(documentId);
    if (round === null) {
      return 0;
    }
    await this.resolveWithoutDecision(round.id, 'SUPERSEDED');
    return 1;
  }

  async findApproverCandidates(approverIds: readonly string[]) {
    return approverIds.map((id) => ({
      id,
      email: `${id}@hms.local`,
      isPatient: false,
      canDecide: true,
    }));
  }
}

describe('Documents registry integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const fakeRepository = new InMemoryManagedDocumentRepository();
  const fakeApprovalRepository = new InMemoryDocumentApprovalRepository(fakeRepository);
  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };
  // The `document-approval` entitlement gates the decide controller and the
  // submit/withdraw routes (`P16-T31`). Prisma is a mock here, so the real
  // cache has nothing to read; a stub keeps these cases about the approval
  // rules rather than about the entitlement, which has its own coverage in
  // `feature-guard-coverage.spec.ts`.
  const featureAvailabilityCacheMock = { isEnabled: jest.fn<Promise<boolean>, [string]>() };
  const objectStorageMock = {
    headObject: jest.fn(),
    getObject: jest.fn(),
    generateObjectKey: jest.fn(),
    getSignedUploadUrl: jest.fn(),
    getSignedUrl: jest.fn(),
    deleteObject: jest.fn(),
  };
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
  const typeCatalog: Record<string, DocumentTypeRecord> = {
    [TYPE_ID]: activeType,
    [AGREEMENT_TYPE_ID]: {
      ...activeType,
      id: AGREEMENT_TYPE_ID,
      code: 'AGREEMENT_PATIENT_DOCTOR',
      requiresPatient: true,
      requiresDoctor: true,
    },
    [POLICY_TYPE_ID]: { ...activeType, id: POLICY_TYPE_ID, code: 'CLINIC_POLICY_SOP' },
    [UPLOAD_ONLY_TYPE_ID]: {
      ...activeType,
      id: UPLOAD_ONLY_TYPE_ID,
      code: 'CLINIC_CORPUS_DOCUMENT',
      contentMode: 'UPLOADED',
    },
    // P16-T29. The one type in this fixture whose policy is on, so the
    // lifecycle cases have something that cannot be issued straight out of
    // draft.
    [APPROVAL_TYPE_ID]: { ...activeType, id: APPROVAL_TYPE_ID, isApprovalRequired: true },
  };
  const documentTypeRepositoryMock = {
    findById: jest.fn(async (id: string) => typeCatalog[id] ?? null),
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
      .overrideProvider(DocumentApprovalRepository)
      .useValue(fakeApprovalRepository)
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
    fakeRepository.reset();
    fakeApprovalRepository.reset();
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(true);
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

  it('enforces the party and content rules of the type (FR-E5-35)', async () => {
    mockActor(OTHER_USER_ID, [REGISTRY_READ, REGISTRY_WRITE]);
    const token = await buildToken(OTHER_USER_ID);
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(DOCUMENTS_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    const agreementWithoutDoctor = await post({
      typeId: AGREEMENT_TYPE_ID,
      title: 'agreement',
      patientId: PATIENT_ID,
    });
    const agreementComplete = await post({
      typeId: AGREEMENT_TYPE_ID,
      title: 'agreement',
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      contentHtml: '<p>Setuju</p>',
    });
    const policyWithPatient = await post({
      typeId: POLICY_TYPE_ID,
      title: 'policy',
      patientId: PATIENT_ID,
    });
    const uploadOnlyDrafted = await post({
      typeId: UPLOAD_ONLY_TYPE_ID,
      title: 'corpus',
      contentHtml: '<p>x</p>',
    });

    expect(agreementWithoutDoctor.status).toBe(422);
    expect(agreementWithoutDoctor.body.error).toMatchObject({
      code: 'MANAGED_DOCUMENT_TYPE_RULE',
      details: { issues: [{ code: 'DOCTOR_REQUIRED', field: 'doctorId' }] },
    });
    expect(agreementComplete.status).toBe(201);
    expect(agreementComplete.body.data).toMatchObject({ hasContentHtml: true, storageKey: null });
    expect(policyWithPatient.status).toBe(422);
    expect(policyWithPatient.body.error.details.issues).toEqual([
      { code: 'PATIENT_NOT_ALLOWED', field: 'patientId' },
    ]);
    expect(uploadOnlyDrafted.status).toBe(422);
    expect(uploadOnlyDrafted.body.error.details.issues).toEqual([
      { code: 'CONTENT_MUST_BE_UPLOADED', field: 'storageKey' },
    ]);
  });

  it('mints an upload URL under the registry prefix and refuses a foreign key at record time', async () => {
    mockActor(OTHER_USER_ID, [REGISTRY_READ, REGISTRY_WRITE]);
    const token = await buildToken(OTHER_USER_ID);
    objectStorageMock.generateObjectKey.mockReturnValue(
      'documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
    );
    objectStorageMock.getSignedUploadUrl.mockResolvedValue({
      url: 'https://storage.test/put',
      key: 'documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
      expiresAt: '2026-09-30T02:05:00.000Z',
      requiredHeaders: { 'Content-Type': 'application/pdf' },
    });

    const signed = await request(app.getHttpServer())
      .post(`${DOCUMENTS_PATH}/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 1024 });
    const foreign = await request(app.getHttpServer())
      .post(DOCUMENTS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        typeId: TYPE_ID,
        title: 'scan',
        storageKey: 'documents/patient/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
      });

    expect(signed.status).toBe(200);
    expect(signed.body.data.storageKey).toMatch(/^documents\/managed\//);
    expect(objectStorageMock.getSignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf', contentLengthBytes: 1024 }),
    );
    expect(foreign.status).toBe(400);
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

  describe('approval lifecycle (P16-T29)', () => {
    const APPROVALS_PATH = '/api/v1/v1/document-approvals';

    async function callAs(
      userId: string,
      permissions: Permission[],
      method: 'get' | 'post',
      path: string,
      body?: object,
    ) {
      mockActor(userId, permissions);
      const token = await buildToken(userId);
      const agent = request(app.getHttpServer());
      const call = agent[method](path).set('Authorization', `Bearer ${token}`);
      return body === undefined ? call : call.send(body);
    }

    function seedApprovalDocument(): string {
      return fakeRepository.seed({
        title: 'seeded needs approval',
        typeId: APPROVAL_TYPE_ID,
        type: {
          id: APPROVAL_TYPE_ID,
          code: 'LETTER',
          name: 'Surat',
          behavior: 'GENERIC',
          contentMode: 'EITHER',
          requiresPatient: false,
          requiresDoctor: false,
          isActive: true,
          isApprovalRequired: true,
          allowSelfApproval: false,
          requiredApprovals: 1,
        },
      }).id;
    }

    async function submitAsDrafter(documentId: string) {
      return callAs(
        OWNER_USER_ID,
        [REGISTRY_READ, REGISTRY_WRITE],
        'post',
        `${DOCUMENTS_PATH}/${documentId}/submit`,
        { approverIds: [APPROVER_USER_ID] },
      );
    }

    it('refuses to issue a document whose type requires approval (FR-E5-11)', async () => {
      const documentId = seedApprovalDocument();

      const response = await callAs(
        OWNER_USER_ID,
        [REGISTRY_READ, REGISTRY_WRITE],
        'post',
        `${DOCUMENTS_PATH}/${documentId}/issue`,
      );

      // The client never saw an Issue button; this is what happens when it
      // calls the route anyway (NFR-SEC-09).
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DOCUMENT_APPROVAL_REQUIRED');
    });

    it('issues directly when the type requires no approval (FR-E5-12)', async () => {
      const documentId = fakeRepository.seed({ title: 'seeded no approval needed' }).id;

      const response = await callAs(
        OWNER_USER_ID,
        [REGISTRY_READ, REGISTRY_WRITE],
        'post',
        `${DOCUMENTS_PATH}/${documentId}/issue`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ISSUED');
      expect(response.body.data.issuedAt).not.toBeNull();
    });

    it('moves a submitted document to PENDING_APPROVAL and summarises its round', async () => {
      const documentId = seedApprovalDocument();

      const response = await submitAsDrafter(documentId);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('PENDING_APPROVAL');
      expect(response.body.data.approval.approverCount).toBe(1);
      expect(response.body.data.approval.isOverdue).toBe(false);
    });

    it('refuses a second submission while a round is open', async () => {
      const documentId = seedApprovalDocument();
      await submitAsDrafter(documentId);

      const response = await submitAsDrafter(documentId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DOCUMENT_NOT_SUBMITTABLE');
    });

    it('refuses the decide routes to a caller who only holds the registry write', async () => {
      const documentId = seedApprovalDocument();
      const submitted = await submitAsDrafter(documentId);
      const roundId = submitted.body.data.approval.roundId;

      const response = await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, REGISTRY_WRITE],
        'post',
        `${APPROVALS_PATH}/${roundId}/approve`,
      );

      // §7.5.9: authoring is not signing off, and the guard is where that
      // separation is real rather than advisory.
      expect(response.status).toBe(403);
    });

    it('refuses a holder of the decide key who was not named on the round (FR-E5-13)', async () => {
      const documentId = seedApprovalDocument();
      const submitted = await submitAsDrafter(documentId);
      const roundId = submitted.body.data.approval.roundId;

      const response = await callAs(
        OTHER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'post',
        `${APPROVALS_PATH}/${roundId}/approve`,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('DOCUMENT_APPROVAL_NOT_AN_APPROVER');
    });

    it('issues the frozen version when the named approver approves (FR-E5-16)', async () => {
      const documentId = seedApprovalDocument();
      const submitted = await submitAsDrafter(documentId);
      const roundId = submitted.body.data.approval.roundId;

      const response = await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'post',
        `${APPROVALS_PATH}/${roundId}/approve`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ISSUED');
      expect(response.body.data.approval).toBeNull();
    });

    it('refuses a second decision on a round that has resolved', async () => {
      const documentId = seedApprovalDocument();
      const submitted = await submitAsDrafter(documentId);
      const roundId = submitted.body.data.approval.roundId;
      await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'post',
        `${APPROVALS_PATH}/${roundId}/approve`,
      );

      const response = await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'post',
        `${APPROVALS_PATH}/${roundId}/approve`,
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DOCUMENT_APPROVAL_ALREADY_DECIDED');
    });

    it('refuses a rejection with no reason (FR-E5-17)', async () => {
      const documentId = seedApprovalDocument();
      const submitted = await submitAsDrafter(documentId);
      const roundId = submitted.body.data.approval.roundId;

      const response = await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'post',
        `${APPROVALS_PATH}/${roundId}/reject`,
        { reason: '   ' },
      );

      expect(response.status).toBe(400);
    });

    it('returns a rejected document to DRAFT and keeps the reason in its history', async () => {
      const documentId = seedApprovalDocument();
      const submitted = await submitAsDrafter(documentId);
      const roundId = submitted.body.data.approval.roundId;
      const inputReason = 'Pasal 4 bertentangan dengan kebijakan pengembalian dana klinik.';

      const rejected = await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'post',
        `${APPROVALS_PATH}/${roundId}/reject`,
        { reason: inputReason },
      );
      const history = await callAs(
        OWNER_USER_ID,
        [REGISTRY_READ],
        'get',
        `${DOCUMENTS_PATH}/${documentId}/history`,
      );

      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('DRAFT');
      expect(history.body.data.rounds[0].decisions[0].reason).toBe(inputReason);
    });

    it('lists everything awaiting the caller and matches the badge (US-E5-02)', async () => {
      for (let index = 0; index < 3; index += 1) {
        await submitAsDrafter(seedApprovalDocument());
      }

      const queue = await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'get',
        `${APPROVALS_PATH}?assignedToMe=true`,
      );
      const badge = await callAs(
        APPROVER_USER_ID,
        [REGISTRY_READ, APPROVAL_DECIDE],
        'get',
        `${APPROVALS_PATH}/pending-count`,
      );

      expect(queue.body.data.items).toHaveLength(3);
      expect(badge.body.data.pending).toBe(3);
    });

    it('narrows the registry to what is awaiting one approver, and never widens it', async () => {
      const documentId = seedApprovalDocument();
      await submitAsDrafter(documentId);

      mockActor(OWNER_USER_ID, [REGISTRY_READ]);
      const token = await buildToken(OWNER_USER_ID);
      const awaited = await request(app.getHttpServer())
        .get(`${DOCUMENTS_PATH}?approver=${APPROVER_USER_ID}`)
        .set('Authorization', `Bearer ${token}`);
      const awaitedByNobody = await request(app.getHttpServer())
        .get(`${DOCUMENTS_PATH}?approver=${OTHER_USER_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(awaited.body.data.items.map((item: { id: string }) => item.id)).toEqual([documentId]);
      // The filter that matches nothing must return nothing rather than the
      // whole registry — a saved "awaiting me" view that silently widened
      // would show a clerk every document in the clinic.
      expect(awaitedByNobody.body.data.items).toEqual([]);
    });

    it('voids the open round when the drafter edits the document (FR-E5-15)', async () => {
      const documentId = seedApprovalDocument();
      await submitAsDrafter(documentId);

      mockActor(OWNER_USER_ID, [REGISTRY_READ, REGISTRY_WRITE]);
      const token = await buildToken(OWNER_USER_ID);
      const edited = await request(app.getHttpServer())
        .patch(`${DOCUMENTS_PATH}/${documentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'seeded needs approval (rev 2)' });

      expect(edited.status).toBe(200);
      expect(edited.body.data.status).toBe('DRAFT');
      expect(edited.body.data.approval).toBeNull();
    });

    it('takes the whole approval surface away when the entitlement is off (US-E5-06)', async () => {
      featureAvailabilityCacheMock.isEnabled.mockResolvedValue(false);
      const documentId = seedApprovalDocument();

      const submitted = await submitAsDrafter(documentId);

      expect(submitted.status).toBe(403);
      expect(submitted.body.error.code).toBe('FEATURE_DISABLED');
      featureAvailabilityCacheMock.isEnabled.mockResolvedValue(true);
    });

    it('leaves the registry listing and searching with the entitlement off', async () => {
      // Switching approval off takes away the second signature and nothing
      // else: the clinic still lists, searches and exports its documents. The
      // registry routes never consult the entitlement at all, which is what
      // this asserts — a `false` queued on the stub is left untouched.
      featureAvailabilityCacheMock.isEnabled.mockResolvedValue(false);

      const listed = await callAs(OWNER_USER_ID, [REGISTRY_READ], 'get', DOCUMENTS_PATH);

      expect(listed.status).toBe(200);
      expect(listed.body.data.items.length).toBeGreaterThan(0);
      featureAvailabilityCacheMock.isEnabled.mockResolvedValue(true);
    });

    it('withdraws an open round without recording a decision (FR-E5-18)', async () => {
      const documentId = seedApprovalDocument();
      await submitAsDrafter(documentId);

      const response = await callAs(
        OWNER_USER_ID,
        [REGISTRY_READ, REGISTRY_WRITE],
        'post',
        `${DOCUMENTS_PATH}/${documentId}/withdraw`,
      );
      const history = await callAs(
        OWNER_USER_ID,
        [REGISTRY_READ],
        'get',
        `${DOCUMENTS_PATH}/${documentId}/history`,
      );

      expect(response.body.data.status).toBe('DRAFT');
      expect(history.body.data.rounds[0].status).toBe('WITHDRAWN');
      expect(history.body.data.rounds[0].decisions).toEqual([]);
    });
  });

});
