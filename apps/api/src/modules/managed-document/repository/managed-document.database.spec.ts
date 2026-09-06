import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { ManagedDocumentAccessContext } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentTypeRepository } from './document-type.repository';
import { ManagedDocumentRepository } from './managed-document.repository';

/**
 * `P16-T28` through the repository against real PostgreSQL, because the
 * guarantees worth proving here only exist in the database: the CHECK that
 * a document is drafted or uploaded and never both, the CHECK that a row
 * governs at most one subject, the RESTRICT that keeps a type in use from
 * being deleted, and — the one this feature exists for — the per-row source
 * rule (FR-E5-04) evaluated as a predicate, so the count and the page agree
 * and a vault document's registry row is invisible to everyone but its
 * owner whatever else they hold.
 *
 * Every fixture row is removed in `afterAll`; nothing existing is mutated.
 */
describe('Managed documents against PostgreSQL', () => {
  const suffix = randomUUID();
  const marker = `p16t28-${suffix}`;

  let prisma: PrismaService;
  let repository: ManagedDocumentRepository;
  let typeRepository: DocumentTypeRepository;
  let ownerUserId: string;
  let otherUserId: string;
  let typeId: string;
  let vaultDocumentId: string;
  let corpusDocumentId: string;
  let patientId: string;
  const managedDocumentIds: string[] = [];

  function buildAccess(
    overrides: Partial<ManagedDocumentAccessContext> = {},
  ): ManagedDocumentAccessContext {
    return {
      userId: otherUserId,
      canReadInvoices: false,
      canReadTemplates: false,
      canReadClinicCorpus: false,
      canReadPatientDocuments: false,
      ...overrides,
    };
  }

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `${marker}-${label}@example.test`, passwordHash: 'not-a-hash' },
      select: { id: true },
    });
    return user.id;
  }

  async function createStoreDocument(
    purpose: 'DOCTOR_VAULT' | 'FAQ_KNOWLEDGE_BASE',
  ): Promise<string> {
    const isVault = purpose === 'DOCTOR_VAULT';
    const document = await prisma.document.create({
      data: {
        ownerType: isVault ? 'DOCTOR' : 'CLINIC',
        ownerId: isVault ? ownerUserId : null,
        purpose,
        title: `${marker} ${purpose}`,
        storageKey: `documents/${isVault ? 'vault/doctor' : 'clinic'}/${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 10,
        ingestStatus: 'NOT_APPLICABLE',
        uploadedById: ownerUserId,
        ...(isVault ? { vaultCategory: 'OTHER' } : {}),
      },
      select: { id: true },
    });
    return document.id;
  }

  async function createManagedDocument(params: {
    title: string;
    subjectDocumentId?: string;
    contentHtml?: string | null;
    storageKey?: string | null;
    patientId?: string;
  }): Promise<string> {
    const record = await repository.createDocument({
      typeId,
      status: 'DRAFT',
      title: `${marker} ${params.title}`,
      documentNumber: null,
      contentHtml: params.contentHtml === undefined ? '<p>x</p>' : params.contentHtml,
      storageKey: params.storageKey ?? null,
      storageMimeType: params.storageKey ? 'application/pdf' : null,
      storageSizeBytes: params.storageKey ? 10 : null,
      patientId: params.patientId ?? null,
      doctorId: null,
      subjectTemplateId: null,
      subjectDocumentId: params.subjectDocumentId ?? null,
      subjectInvoiceId: null,
      draftedById: ownerUserId,
      issuedAt: null,
    });
    managedDocumentIds.push(record.id);
    return record.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new ManagedDocumentRepository(prisma);
    typeRepository = new DocumentTypeRepository(prisma);
    ownerUserId = await createUser('owner');
    otherUserId = await createUser('other');
    const type = await typeRepository.createType({
      code: `P16T28_${suffix.replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      name: `${marker} type`,
      description: null,
      behavior: 'GENERIC',
      isApprovalRequired: false,
      allowSelfApproval: false,
      requiredApprovals: 1,
      requiresPatient: false,
      requiresDoctor: false,
      contentMode: 'EITHER',
      isActive: true,
      sortOrder: 999,
    });
    typeId = type.id;
    vaultDocumentId = await createStoreDocument('DOCTOR_VAULT');
    corpusDocumentId = await createStoreDocument('FAQ_KNOWLEDGE_BASE');
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `P16T28-${suffix}`,
        fullName: `${marker} patient`,
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        sex: 'FEMALE',
        phoneNumber: '+6280000000000',
        address: 'Jl. Fixture No. 1',
      },
      select: { id: true },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await prisma.managedDocument.deleteMany({ where: { id: { in: managedDocumentIds } } });
    await prisma.document.deleteMany({
      where: { id: { in: [vaultDocumentId, corpusDocumentId] } },
    });
    await prisma.documentType.deleteMany({ where: { id: typeId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it('CHECK rejects a row that is both drafted and uploaded', async () => {
    await expect(
      createManagedDocument({
        title: 'both',
        contentHtml: '<p>x</p>',
        storageKey: `documents/managed/${randomUUID()}.pdf`,
      }),
    ).rejects.toThrow(/managed_documents_content_check/);
  });

  it('CHECK rejects an uploaded row without its stored metadata', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "managed_documents"
          ("id", "type_id", "title", "storage_key", "drafted_by_id", "updated_at")
        VALUES
          (gen_random_uuid(), ${typeId}::uuid, ${`${marker} bare`},
           ${`documents/managed/${randomUUID()}.pdf`}, ${ownerUserId}::uuid, now())
      `,
    ).rejects.toThrow(/managed_documents_content_check/);
  });

  it('CHECK rejects a row pointing at two subjects', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "managed_documents"
          ("id", "type_id", "title", "content_html", "subject_document_id", "subject_template_id",
           "drafted_by_id", "updated_at")
        VALUES
          (gen_random_uuid(), ${typeId}::uuid, ${`${marker} two subjects`}, '<p>x</p>',
           ${vaultDocumentId}::uuid, gen_random_uuid(), ${ownerUserId}::uuid, now())
      `,
    ).rejects.toThrow(/managed_documents_subject_check/);
  });

  it('shows a vault-sourced row to its owner alone, and keeps it out of the count for everyone else', async () => {
    const plainId = await createManagedDocument({ title: 'plain' });
    const vaultRowId = await createManagedDocument({
      title: 'vault governed',
      subjectDocumentId: vaultDocumentId,
    });

    const asOther = await repository.listDocuments({
      access: buildAccess({ canReadClinicCorpus: true, canReadInvoices: true }),
      search: marker,
      dateField: 'created',
      page: 1,
      limit: 50,
    });
    const asOwner = await repository.listDocuments({
      access: buildAccess({ userId: ownerUserId }),
      search: marker,
      dateField: 'created',
      page: 1,
      limit: 50,
    });

    expect(asOther.items.map((item) => item.id)).toEqual([plainId]);
    expect(asOther.total).toBe(1);
    expect(asOwner.items.map((item) => item.id).sort()).toEqual([plainId, vaultRowId].sort());
    expect(asOwner.total).toBe(2);
    expect(await repository.findVisibleById(vaultRowId, buildAccess())).toBeNull();
    expect(
      (await repository.findVisibleById(vaultRowId, buildAccess({ userId: ownerUserId })))?.id,
    ).toBe(vaultRowId);
  });

  it('opens a corpus-sourced row on the clinic-corpus read grant and on nothing else', async () => {
    const corpusRowId = await createManagedDocument({
      title: 'corpus governed',
      subjectDocumentId: corpusDocumentId,
    });

    expect(await repository.findVisibleById(corpusRowId, buildAccess())).toBeNull();
    expect(
      await repository.findVisibleById(corpusRowId, buildAccess({ canReadInvoices: true })),
    ).toBeNull();
    expect(
      (await repository.findVisibleById(corpusRowId, buildAccess({ canReadClinicCorpus: true })))
        ?.id,
    ).toBe(corpusRowId);
  });

  it('counts live rows per type and RESTRICTs deleting a type in use', async () => {
    const counts = await typeRepository.countDocumentsByType([typeId]);

    expect(counts.get(typeId)).toBeGreaterThanOrEqual(3);
    await expect(prisma.documentType.delete({ where: { id: typeId } })).rejects.toThrow();
  });

  it('finds a patient’s agreements by their name and RESTRICTs deleting the patient (P16-T36)', async () => {
    const agreementId = await createManagedDocument({ title: 'agreement', patientId });

    const byName = await repository.listDocuments({
      access: buildAccess(),
      search: `${marker} patient`,
      dateField: 'created',
      page: 1,
      limit: 10,
    });

    expect(byName.items.map((item) => item.id)).toEqual([agreementId]);
    expect(byName.items[0]?.patient?.fullName).toBe(`${marker} patient`);
    await expect(prisma.patientProfile.delete({ where: { id: patientId } })).rejects.toThrow();
  });
});
