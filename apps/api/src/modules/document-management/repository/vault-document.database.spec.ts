import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentRepository } from './document.repository';
import { DocumentRetrievalRepository } from './document-retrieval.repository';
import { VaultDocumentRepository } from './vault-document.repository';

/**
 * `P16-T16` through the repository against real PostgreSQL, because the
 * guarantees worth proving here only exist in the database: the CHECKs that
 * tie the filing columns to `DOCTOR_VAULT` and a vault to an owner, the
 * uniqueness that makes the expiry job safe to re-run, and the retrieval SQL
 * that must exclude a vault chunk even when one has been forced into the
 * table behind the pipeline's back.
 *
 * That last case is the one this feature exists to prevent. A vault holds a
 * doctor's KTP and their contracts, and it sits one enum value away from the
 * personal knowledge base, whose whole job is to send its passages to an
 * embedding provider. Proving the exclusion against the real query — with a
 * knowledge-base control chunk that *does* come back, so the query is known
 * to have matched — is the only way to know the two never became one.
 *
 * Every fixture row is removed in `afterAll`; nothing existing is mutated.
 */
describe('Doctor vault documents against PostgreSQL', () => {
  const suffix = randomUUID();
  const uniqueTerm = `vaultterm${suffix.replaceAll('-', '')}`;

  let prisma: PrismaService;
  let repository: VaultDocumentRepository;
  let documentRepository: DocumentRepository;
  let retrievalRepository: DocumentRetrievalRepository;
  let ownerUserId: string;
  let otherOwnerUserId: string;
  const documentIds: string[] = [];

  function trackDocument(id: string): string {
    documentIds.push(id);
    return id;
  }

  async function createVaultDocument(ownerId: string, title: string) {
    const record = await repository.createVaultDocument({
      ownerType: 'DOCTOR',
      ownerId,
      title,
      storageKey: `documents/vault/doctor/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      language: 'ID',
      vaultCategory: 'REGISTRATION_LICENCE',
      referenceNumber: `STR/${suffix}`,
      issuedAt: new Date('2024-01-01T00:00:00Z'),
      expiresAt: new Date('2029-01-01T00:00:00Z'),
      uploadedById: ownerId,
    });
    trackDocument(record.id);
    return record;
  }

  async function forceChunk(documentId: string, content: string): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO "document_chunks"
        ("id", "document_id", "chunk_index", "content", "search_vector",
         "embedding_model", "embedding_version", "visibility", "language", "created_at")
      VALUES
        (gen_random_uuid(), ${documentId}::uuid, 0, ${content},
         to_tsvector('simple'::regconfig, ${content}),
         'fixture-model', 'v1', 'BOTH'::"DocumentVisibility", 'ID'::"DocumentLanguage", now())
    `;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new VaultDocumentRepository(prisma);
    documentRepository = new DocumentRepository(prisma);
    retrievalRepository = new DocumentRetrievalRepository(prisma);
    const users = await prisma.user.findMany({ take: 2, select: { id: true } });
    const [owner, otherOwner] = users;
    if (owner === undefined || otherOwner === undefined) {
      throw new Error('The dev database needs two users to prove owner scoping');
    }
    ownerUserId = owner.id;
    otherOwnerUserId = otherOwner.id;
  });

  afterAll(async () => {
    await prisma.documentChunk.deleteMany({ where: { documentId: { in: documentIds } } });
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.$disconnect();
  });

  it('stores a vault document resting at NOT_APPLICABLE, owned by a person', async () => {
    const record = await createVaultDocument(ownerUserId, `STR ${suffix}`);

    expect(record.purpose).toBe('DOCTOR_VAULT');
    expect(record.ownerType).toBe('DOCTOR');
    expect(record.ownerId).toBe(ownerUserId);
    expect(record.ingestStatus).toBe('NOT_APPLICABLE');
    expect(record.vaultCategory).toBe('REGISTRATION_LICENCE');
    expect(record.patientId).toBeNull();
  });

  it('is invisible to the ingestion worker: the claim predicate cannot match it and no chunk exists', async () => {
    const claimable = await prisma.document.findMany({
      where: { id: { in: documentIds }, ingestStatus: 'PENDING', deletedAt: null },
      select: { id: true },
    });
    const chunkCount = await prisma.documentChunk.count({
      where: { documentId: { in: documentIds } },
    });

    expect(claimable).toEqual([]);
    expect(chunkCount).toBe(0);
  });

  it('never lists another owner’s rows', async () => {
    const mine = await createVaultDocument(ownerUserId, `Mine ${suffix}`);
    const theirs = await createVaultDocument(otherOwnerUserId, `Theirs ${suffix}`);

    const page = await repository.listVaultDocuments({ ownerId: ownerUserId, limit: 100 });

    const listedIds = page.items.map((item) => item.id);
    expect(listedIds).toContain(mine.id);
    expect(listedIds).not.toContain(theirs.id);
  });

  it('searches title and reference number case-insensitively, within one owner only', async () => {
    const byTitle = await createVaultDocument(ownerUserId, `Sertifikat Kompetensi ${suffix}`);
    const unrelated = await createVaultDocument(ownerUserId, `Kontrak Kerja ${suffix}`);
    const theirs = await createVaultDocument(otherOwnerUserId, `Sertifikat Lain ${suffix}`);

    const titlePage = await repository.listVaultDocuments({
      ownerId: ownerUserId,
      search: 'sertifikat kompetensi',
      limit: 100,
    });
    const referencePage = await repository.listVaultDocuments({
      ownerId: ownerUserId,
      search: `str/${suffix}`.toUpperCase(),
      limit: 100,
    });

    const titleIds = titlePage.items.map((item) => item.id);
    expect(titleIds).toContain(byTitle.id);
    expect(titleIds).not.toContain(unrelated.id);
    expect(titleIds).not.toContain(theirs.id);
    // Every fixture of this owner carries the same reference number, so the
    // reference search finds the unrelated title too — and still not theirs.
    const referenceIds = referencePage.items.map((item) => item.id);
    expect(referenceIds).toContain(byTitle.id);
    expect(referenceIds).toContain(unrelated.id);
    expect(referenceIds).not.toContain(theirs.id);
  });

  it('reads another owner’s document as nothing, so a foreign id is indistinguishable from a missing one', async () => {
    const theirs = await createVaultDocument(otherOwnerUserId, `Theirs read ${suffix}`);

    const foreign = await repository.findVaultDocumentById(theirs.id, ownerUserId);
    const missing = await repository.findVaultDocumentById(randomUUID(), ownerUserId);

    expect(foreign).toBeNull();
    expect(missing).toBeNull();
  });

  it('refuses to update another owner’s document', async () => {
    const theirs = await createVaultDocument(otherOwnerUserId, `Theirs update ${suffix}`);

    const updated = await repository.updateVaultDocument(theirs.id, ownerUserId, {
      title: 'renamed by a stranger',
    });
    const untouched = await repository.findVaultDocumentById(theirs.id, otherOwnerUserId);

    expect(updated).toBeNull();
    expect(untouched?.title).toBe(`Theirs update ${suffix}`);
  });

  it('hard-deletes the row and returns the key the object still needs deleting under', async () => {
    const record = await createVaultDocument(ownerUserId, `Delete me ${suffix}`);

    const result = await repository.deleteVaultDocument(record.id, ownerUserId);
    const afterwards = await prisma.document.findUnique({ where: { id: record.id } });

    // Hard, not soft: a doctor's own paperwork falls under no retention floor
    // (FR-E3-09), so "deleted" has to mean the row is gone.
    expect(result).toEqual({ id: record.id, storageKey: record.storageKey });
    expect(afterwards).toBeNull();
  });

  it('refuses to delete another owner’s document', async () => {
    const theirs = await createVaultDocument(otherOwnerUserId, `Theirs delete ${suffix}`);

    const result = await repository.deleteVaultDocument(theirs.id, ownerUserId);
    const survivor = await prisma.document.findUnique({ where: { id: theirs.id } });

    expect(result).toBeNull();
    expect(survivor).not.toBeNull();
  });

  it('records one expiry notice per threshold, so a job that runs twice notifies once', async () => {
    const record = await createVaultDocument(ownerUserId, `Expiring ${suffix}`);

    const beforeFirst = await repository.hasExpiryNotice(record.id, 30);
    await repository.recordExpiryNotice(record.id, 30);
    await repository.recordExpiryNotice(record.id, 30);
    const afterSecond = await repository.hasExpiryNotice(record.id, 30);
    const noticeCount = await prisma.vaultDocumentExpiryNotice.count({
      where: { documentId: record.id },
    });
    await repository.recordExpiryNotice(record.id, 7);
    const thresholdCount = await prisma.vaultDocumentExpiryNotice.count({
      where: { documentId: record.id },
    });

    expect(beforeFirst).toBe(false);
    expect(afterSecond).toBe(true);
    expect(noticeCount).toBe(1);
    // A second threshold is a second notice — 30 days out and 7 days out are
    // different things to be told, and the first must not suppress the second.
    expect(thresholdCount).toBe(2);
  });

  it('cascades expiry notices away with the document they annotate', async () => {
    const record = await createVaultDocument(ownerUserId, `Cascade ${suffix}`);
    await repository.recordExpiryNotice(record.id, 30);

    await repository.deleteVaultDocument(record.id, ownerUserId);
    const orphanCount = await prisma.vaultDocumentExpiryNotice.count({
      where: { documentId: record.id },
    });

    expect(orphanCount).toBe(0);
  });

  it('CHECK rejects filing columns on a knowledge-base document', async () => {
    // Without this, a knowledge-base row could carry an `expires_at` and be
    // picked up by the reminder job, which would then tell a doctor their
    // notes are about to expire.
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "owner_id", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "expires_at", "updated_at")
        VALUES
          (gen_random_uuid(), 'DOCTOR'::"DocumentOwnerType", ${ownerUserId}::uuid,
           'PERSONAL_KNOWLEDGE_BASE'::"DocumentPurpose", 'misfiled kb doc',
           ${`documents/doctor/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'PENDING'::"DocumentIngestStatus", ${ownerUserId}::uuid, DATE '2027-01-01', now())
      `,
    ).rejects.toThrow(/documents_vault_columns_are_vault_check/);
  });

  it('CHECK rejects a vault document with no owner', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "updated_at")
        VALUES
          (gen_random_uuid(), 'DOCTOR'::"DocumentOwnerType", 'DOCTOR_VAULT'::"DocumentPurpose",
           'ownerless vault doc', ${`documents/vault/doctor/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'NOT_APPLICABLE'::"DocumentIngestStatus", ${ownerUserId}::uuid, now())
      `,
    ).rejects.toThrow(/documents_doctor_vault_owner_check/);
  });

  it('CHECK rejects a clinic-owned vault document', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "owner_id", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "updated_at")
        VALUES
          (gen_random_uuid(), 'CLINIC'::"DocumentOwnerType", ${ownerUserId}::uuid,
           'DOCTOR_VAULT'::"DocumentPurpose", 'clinic vault doc',
           ${`documents/vault/doctor/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'NOT_APPLICABLE'::"DocumentIngestStatus", ${ownerUserId}::uuid, now())
      `,
    ).rejects.toThrow(/documents_doctor_vault_owner_check/);
  });

  it('CHECK rejects an expiry that precedes its issue date', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "owner_id", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "issued_at", "expires_at", "updated_at")
        VALUES
          (gen_random_uuid(), 'DOCTOR'::"DocumentOwnerType", ${ownerUserId}::uuid,
           'DOCTOR_VAULT'::"DocumentPurpose", 'backwards dates',
           ${`documents/vault/doctor/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'NOT_APPLICABLE'::"DocumentIngestStatus", ${ownerUserId}::uuid,
           DATE '2027-01-01', DATE '2026-01-01', now())
      `,
    ).rejects.toThrow(/documents_vault_expiry_after_issue_check/);
  });

  it('retrieval cannot return a vault chunk even when one is forced into the table', async () => {
    const vaultDocument = await createVaultDocument(ownerUserId, `Retrievable? ${suffix}`);
    const controlDocument = await documentRepository.createDocument({
      ownerType: 'DOCTOR',
      ownerId: ownerUserId,
      purpose: 'PERSONAL_KNOWLEDGE_BASE',
      title: `Control KB ${suffix}`,
      storageKey: `documents/doctor/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'READY',
      uploadedById: ownerUserId,
    });
    trackDocument(controlDocument.id);
    await forceChunk(vaultDocument.id, `ktp ${uniqueTerm} pribadi`);
    await forceChunk(controlDocument.id, `catatan ${uniqueTerm} klinis`);

    const candidates = await retrievalRepository.searchByFullText({
      queryText: uniqueTerm,
      queryEmbedding: [],
      embeddingModel: 'fixture-model',
      embeddingVersion: 'v1',
      channelVisibility: 'DOCTOR',
      ownerUserId,
      candidateLimit: 10,
    });

    // The control chunk proves the query matched the term and that this
    // owner's corpus is in scope; the vault chunk's absence proves the
    // exclusion is the predicate, not bad luck.
    const candidateDocumentIds = candidates.map((candidate) => candidate.documentId);
    expect(candidateDocumentIds).toContain(controlDocument.id);
    expect(candidateDocumentIds).not.toContain(vaultDocument.id);
  });
});
