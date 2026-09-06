import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CreateDocumentTypeRecordPayload,
  DocumentTypeApproverCandidateRecord,
  DocumentTypeRecord,
  UpdateDocumentTypeRecordPayload,
} from '@hms/shared-types';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DocumentTypeRepository } from './repository/document-type.repository';

const TYPES_PATH = '/api/v1/v1/document-types';

/**
 * `P16-T39` over the wired stack: guard, strict Zod pipe, and the service
 * rules, with persistence replaced by an in-memory fake. What the database
 * itself must uphold — the unique code, the cascade on the approver table —
 * is Prisma's and the migration's, not this spec's.
 *
 * The cases here are the safety boundary of dynamic types (§7.5.10): a
 * request carrying `behavior` is refused by the DTO rather than stripped, a
 * system row's code and existence are refused for mutation, and a rename of
 * `INVOICE_TEMPLATE` succeeds while its code — what the E1 handler resolves
 * on — is untouched.
 */
class InMemoryDocumentTypeRepository {
  private readonly types = new Map<string, DocumentTypeRecord>();
  private nextId = 1;
  documentCountByType = new Map<string, number>();
  approverCandidates: DocumentTypeApproverCandidateRecord[] = [];

  reset(): void {
    this.types.clear();
    this.documentCountByType.clear();
    this.approverCandidates = [];
    this.nextId = 1;
  }

  seedSystemType(overrides: Partial<DocumentTypeRecord>): DocumentTypeRecord {
    const record = this.buildRecord({ isSystem: true, ...overrides });
    this.types.set(record.id, record);
    return record;
  }

  async listTypes(params: { includeInactive: boolean }): Promise<DocumentTypeRecord[]> {
    return [...this.types.values()]
      .filter((type) => params.includeInactive || type.isActive)
      .map((type) => this.withCount(type));
  }

  async findById(id: string): Promise<DocumentTypeRecord | null> {
    const type = this.types.get(id);
    return type === undefined ? null : this.withCount(type);
  }

  async listAllCodes(): Promise<string[]> {
    return [...this.types.values()].map((type) => type.code);
  }

  async createType(payload: CreateDocumentTypeRecordPayload): Promise<DocumentTypeRecord> {
    const record = this.buildRecord({ ...payload, isSystem: false });
    this.types.set(record.id, record);
    return record;
  }

  async updateType(payload: UpdateDocumentTypeRecordPayload): Promise<DocumentTypeRecord> {
    const existing = this.types.get(payload.id);
    if (existing === undefined) {
      throw new Error('missing type');
    }
    const { id, ...changes } = payload;
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const updated: DocumentTypeRecord = { ...existing, ...defined, id, updatedAt: new Date() };
    this.types.set(id, updated);
    return this.withCount(updated);
  }

  async softDeleteType(id: string): Promise<void> {
    this.types.delete(id);
  }

  async replaceDefaultApprovers(typeId: string, approverIds: readonly string[]): Promise<void> {
    const existing = this.types.get(typeId);
    if (existing === undefined) {
      throw new Error('missing type');
    }
    this.types.set(typeId, {
      ...existing,
      defaultApprovers: approverIds.map((id) => ({
        id,
        email: this.approverCandidates.find((candidate) => candidate.id === id)?.email ?? id,
      })),
    });
  }

  async findApproverCandidates(
    approverIds: readonly string[],
  ): Promise<DocumentTypeApproverCandidateRecord[]> {
    return this.approverCandidates.filter((candidate) => approverIds.includes(candidate.id));
  }

  private withCount(type: DocumentTypeRecord): DocumentTypeRecord {
    return { ...type, documentCount: this.documentCountByType.get(type.id) ?? 0 };
  }

  private buildRecord(overrides: Partial<DocumentTypeRecord>): DocumentTypeRecord {
    return {
      id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`,
      code: 'TYPE',
      name: 'Type',
      description: null,
      behavior: 'GENERIC',
      isSystem: false,
      isApprovalRequired: false,
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
      ...overrides,
    };
  }
}

describe('Document types integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;

  const fakeRepository = new InMemoryDocumentTypeRepository();
  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        { role: { code: 'ADMIN', permissions: permissions.map((permission) => ({ permission })) } },
      ],
    });
  }

  function mockWriteCapableAdmin(): void {
    mockActorWithPermissions([
      { action: 'read', resource: 'ManagedDocument', scope: 'ANY' },
      { action: 'write', resource: 'DocumentType', scope: 'ANY' },
    ]);
  }

  /**
   * Not async on purpose: a supertest request is thenable, so awaiting the
   * builder would fire it before `.send()` could attach a body.
   */
  function asAdmin(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(DocumentTypeRepository)
      .useValue(fakeRepository)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    jwtService = moduleRef.get(JwtService);
    adminToken = await buildToken('admin-user', 'admin@hms.local');
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
      .post(TYPES_PATH)
      .send({ name: 'Surat Keterangan Sehat' });

    expect(response.status).toBe(401);
  });

  it('refuses a write from an actor holding only the registry read grant', async () => {
    mockActorWithPermissions([{ action: 'read', resource: 'ManagedDocument', scope: 'ANY' }]);

    const response = await asAdmin('post', TYPES_PATH).send({
      name: 'Surat Keterangan Sehat',
    });

    expect(response.status).toBe(403);
  });

  it('rejects a create payload carrying behavior rather than stripping it', async () => {
    mockWriteCapableAdmin();

    const response = await asAdmin('post', TYPES_PATH).send({
      name: 'Korpus rahasia',
      behavior: 'CLINIC_CORPUS',
    });

    expect(response.status).toBe(400);
    expect(fakeRepository.listAllCodes()).resolves.toEqual([]);
  });

  it('creates a clinic type as GENERIC with a generated code', async () => {
    mockWriteCapableAdmin();
    fakeRepository.seedSystemType({ code: 'SURAT_KETERANGAN_SEHAT', name: 'Surat' });

    const response = await asAdmin('post', TYPES_PATH).send({
      name: 'Surat Keterangan Sehat',
      requiresPatient: true,
      contentMode: 'DRAFTED',
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      behavior: 'GENERIC',
      isSystem: false,
      code: 'SURAT_KETERANGAN_SEHAT_2',
      requiresPatient: true,
      contentMode: 'DRAFTED',
      documentCount: 0,
    });
  });

  it('allows two types with the same name and keeps their codes unique', async () => {
    mockWriteCapableAdmin();

    const first = await asAdmin('post', TYPES_PATH).send({ name: 'Surat' });
    const second = await asAdmin('post', TYPES_PATH).send({ name: 'Surat' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.code).toBe('SURAT');
    expect(second.body.data.code).toBe('SURAT_2');
  });

  it('refuses a code change on a system row but renames it, leaving the code intact', async () => {
    mockWriteCapableAdmin();
    const invoiceTemplate = fakeRepository.seedSystemType({
      code: 'INVOICE_TEMPLATE',
      name: 'Templat faktur',
      behavior: 'INVOICE_TEMPLATE',
    });

    const refused = await asAdmin('patch', `${TYPES_PATH}/${invoiceTemplate.id}`).send({
      code: 'MY_TEMPLATE',
    });
    const renamed = await asAdmin('patch', `${TYPES_PATH}/${invoiceTemplate.id}`).send({
      name: 'Kuitansi klinik',
    });

    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('DOCUMENT_TYPE_SYSTEM_ROW');
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({
      name: 'Kuitansi klinik',
      code: 'INVOICE_TEMPLATE',
      behavior: 'INVOICE_TEMPLATE',
    });
  });

  it('refuses deleting a system row, and a clinic type in use with the count', async () => {
    mockWriteCapableAdmin();
    const systemType = fakeRepository.seedSystemType({ code: 'LETTER', name: 'Surat' });
    const created = await asAdmin('post', TYPES_PATH).send({ name: 'Perjanjian sewa' });
    fakeRepository.documentCountByType.set(created.body.data.id, 3);

    const systemRefusal = await asAdmin('delete', `${TYPES_PATH}/${systemType.id}`);
    const inUseRefusal = await asAdmin('delete', `${TYPES_PATH}/${created.body.data.id}`);

    expect(systemRefusal.status).toBe(403);
    expect(inUseRefusal.status).toBe(409);
    expect(inUseRefusal.body.error).toMatchObject({
      code: 'DOCUMENT_TYPE_IN_USE',
      details: { documentCount: 3 },
    });
    expect(await fakeRepository.findById(created.body.data.id)).not.toBeNull();
  });

  it('hides a deactivated type from the default list and shows it on request', async () => {
    mockWriteCapableAdmin();
    const created = await asAdmin('post', TYPES_PATH).send({ name: 'Perjanjian sewa' });
    await asAdmin('patch', `${TYPES_PATH}/${created.body.data.id}`).send({
      isActive: false,
    });

    const pickerList = await asAdmin('get', TYPES_PATH);
    const settingsList = await asAdmin('get', `${TYPES_PATH}?includeInactive=true`);

    expect(pickerList.body.data).toEqual([]);
    expect(settingsList.body.data).toHaveLength(1);
    expect(settingsList.body.data[0].isActive).toBe(false);
  });

  it('accepts staff as default approvers and refuses a patient by id', async () => {
    mockWriteCapableAdmin();
    fakeRepository.approverCandidates = [
      { id: '11111111-1111-4111-8111-111111111111', email: 'staff@hms.local', isPatient: false },
      { id: '22222222-2222-4222-8222-222222222222', email: 'patient@hms.local', isPatient: true },
    ];
    const created = await asAdmin('post', TYPES_PATH).send({ name: 'Perjanjian sewa' });
    const path = `${TYPES_PATH}/${created.body.data.id}/default-approvers`;

    const refused = await asAdmin('put', path).send({
      approverIds: ['22222222-2222-4222-8222-222222222222'],
    });
    const accepted = await asAdmin('put', path).send({
      approverIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(refused.status).toBe(422);
    expect(refused.body.error.details).toEqual({
      approverIds: ['22222222-2222-4222-8222-222222222222'],
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.defaultApprovers).toEqual([
      { id: '11111111-1111-4111-8111-111111111111', email: 'staff@hms.local' },
    ]);
  });

  it('audits SELF_APPROVAL_ENABLED when the policy flips on', async () => {
    mockWriteCapableAdmin();
    const created = await asAdmin('post', TYPES_PATH).send({ name: 'Perjanjian sewa' });
    auditServiceMock.record.mockClear();

    const response = await asAdmin('patch', `${TYPES_PATH}/${created.body.data.id}`).send({
      isApprovalRequired: true,
      allowSelfApproval: true,
    });

    expect(response.status).toBe(200);
    const actions = auditServiceMock.record.mock.calls.map(
      (call) => (call[0] as { action: string }).action,
    );
    expect(actions).toEqual(['UPDATE', 'APPROVAL_POLICY_CHANGED', 'SELF_APPROVAL_ENABLED']);
  });
});
