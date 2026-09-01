import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentRepository } from './document.repository';
import { DocumentRetrievalRepository } from './document-retrieval.repository';

/**
 * `P16-T07` through the repository against real PostgreSQL, because the
 * guarantees worth proving here only exist in the database: the CHECKs that
 * tie purpose, owner type and patient together, the claim predicate the
 * ingestion worker uses, and the retrieval SQL that must exclude a clinical
 * chunk even when one has been forced into the table behind the pipeline's
 * back.
 *
 * Every fixture row is removed in `afterAll`; nothing existing is mutated —
 * the worker-blindness proof asserts on the claim *predicate* scoped to the
 * fixture row rather than running the claim, which would move real PENDING
 * rows on a shared dev database.
 */
describe('Patient clinical documents against PostgreSQL', () => {
  const suffix = randomUUID();
  const uniqueTerm = `uniqterm${suffix.replaceAll('-', '')}`;

  let prisma: PrismaService;
  let repository: DocumentRepository;
  let retrievalRepository: DocumentRetrievalRepository;
  let uploaderUserId: string;
  let patientId: string;
  let otherPatientId: string;
  const documentIds: string[] = [];
  const patientIds: string[] = [];

  async function createPatient(name: string): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `CLIN-${randomUUID()}`,
        fullName: name,
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        sex: 'FEMALE',
        phoneNumber: '+6280000000000',
        address: 'Jl. Fixture No. 1',
      },
      select: { id: true },
    });
    patientIds.push(patient.id);
    return patient.id;
  }

  function trackDocument(id: string): string {
    documentIds.push(id);
    return id;
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
    repository = new DocumentRepository(prisma);
    retrievalRepository = new DocumentRetrievalRepository(prisma);
    const uploader = await prisma.user.findFirst({ select: { id: true } });
    if (uploader === null) {
      throw new Error('The dev database has no users to attribute fixtures to');
    }
    uploaderUserId = uploader.id;
    patientId = await createPatient(`Clinical Fixture A ${suffix}`);
    otherPatientId = await createPatient(`Clinical Fixture B ${suffix}`);
  });

  afterAll(async () => {
    await prisma.documentChunk.deleteMany({ where: { documentId: { in: documentIds } } });
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.$disconnect();
  });

  it('stores a clinical file resting at NOT_APPLICABLE with PATIENT ownership', async () => {
    const record = await repository.createPatientClinicalDocument({
      patientId,
      category: 'LAB_RESULT',
      documentDate: new Date('2026-08-30T00:00:00Z'),
      notes: 'Hasil lab puasa',
      title: `Lab ${suffix}`,
      storageKey: `documents/clinic/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      language: 'ID',
      uploadedById: uploaderUserId,
    });
    trackDocument(record.id);

    expect(record.purpose).toBe('PATIENT_CLINICAL');
    expect(record.ownerType).toBe('PATIENT');
    expect(record.ownerId).toBeNull();
    expect(record.ingestStatus).toBe('NOT_APPLICABLE');
    expect(record.category).toBe('LAB_RESULT');
    expect(record.releasedToPatient).toBe(false);
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

  it('CHECK rejects a clinical document with no patient', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "updated_at")
        VALUES
          (gen_random_uuid(), 'PATIENT'::"DocumentOwnerType", 'PATIENT_CLINICAL'::"DocumentPurpose",
           'orphan clinical', ${`documents/clinic/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'NOT_APPLICABLE'::"DocumentIngestStatus", ${uploaderUserId}::uuid, now())
      `,
    ).rejects.toThrow(/documents_patient_clinical_owner_check/);
  });

  it('CHECK rejects a PATIENT-owned row carrying a corpus purpose', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "patient_id", "updated_at")
        VALUES
          (gen_random_uuid(), 'PATIENT'::"DocumentOwnerType", 'FAQ_KNOWLEDGE_BASE'::"DocumentPurpose",
           'misfiled corpus doc', ${`documents/clinic/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'PENDING'::"DocumentIngestStatus", ${uploaderUserId}::uuid, ${patientId}::uuid, now())
      `,
    ).rejects.toThrow(/documents_patient_clinical_owner_check/);
  });

  it('CHECK rejects a file pointing at both an encounter and an admission', async () => {
    // CHECK constraints are evaluated before FK triggers, so random episode
    // ids prove this constraint without building the whole encounter chain.
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "patient_id",
           "encounter_id", "admission_id", "updated_at")
        VALUES
          (gen_random_uuid(), 'PATIENT'::"DocumentOwnerType", 'PATIENT_CLINICAL'::"DocumentPurpose",
           'double episode', ${`documents/clinic/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'NOT_APPLICABLE'::"DocumentIngestStatus", ${uploaderUserId}::uuid, ${patientId}::uuid,
           ${randomUUID()}::uuid, ${randomUUID()}::uuid, now())
      `,
    ).rejects.toThrow(/documents_one_care_episode_check/);
  });

  it('CHECK rejects clinical annotations on a corpus document', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "documents"
          ("id", "owner_type", "purpose", "title", "storage_key", "mime_type",
           "size_bytes", "ingest_status", "uploaded_by_id", "category", "updated_at")
        VALUES
          (gen_random_uuid(), 'CLINIC'::"DocumentOwnerType", 'FAQ_KNOWLEDGE_BASE'::"DocumentPurpose",
           'categorised corpus doc', ${`documents/clinic/${randomUUID()}.pdf`}, 'application/pdf',
           10, 'PENDING'::"DocumentIngestStatus", ${uploaderUserId}::uuid,
           'LAB_RESULT'::"DocumentCategory", now())
      `,
    ).rejects.toThrow(/documents_care_episode_is_clinical_check/);
  });

  it('retrieval cannot return a clinical chunk even when one is forced into the table', async () => {
    const clinicalDocument = await repository.createPatientClinicalDocument({
      patientId,
      category: 'RADIOLOGY',
      title: `Rontgen ${suffix}`,
      storageKey: `documents/clinic/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      language: 'ID',
      uploadedById: uploaderUserId,
    });
    trackDocument(clinicalDocument.id);
    const controlDocument = await repository.createDocument({
      ownerType: 'CLINIC',
      ownerId: null,
      purpose: 'FAQ_KNOWLEDGE_BASE',
      title: `Control FAQ ${suffix}`,
      storageKey: `documents/clinic/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'READY',
      uploadedById: uploaderUserId,
    });
    trackDocument(controlDocument.id);
    await forceChunk(clinicalDocument.id, `hasil ${uniqueTerm} pasien`);
    await forceChunk(controlDocument.id, `jadwal ${uniqueTerm} klinik`);

    const candidates = await retrievalRepository.searchByFullText({
      queryText: uniqueTerm,
      queryEmbedding: [],
      embeddingModel: 'fixture-model',
      embeddingVersion: 'v1',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
      candidateLimit: 10,
    });

    // The control chunk proves the query matched the term; the clinical
    // chunk's absence proves the exclusion is the predicate, not bad luck.
    const candidateDocumentIds = candidates.map((candidate) => candidate.documentId);
    expect(candidateDocumentIds).toContain(controlDocument.id);
    expect(candidateDocumentIds).not.toContain(clinicalDocument.id);
  });

  it('patient-scoped reads return only that patient\'s files', async () => {
    const otherPatientDocument = await repository.createPatientClinicalDocument({
      patientId: otherPatientId,
      category: 'REFERRAL_LETTER',
      title: `Rujukan ${suffix}`,
      storageKey: `documents/clinic/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 512,
      language: 'ID',
      uploadedById: uploaderUserId,
    });
    trackDocument(otherPatientDocument.id);

    const pageForA = await repository.listPatientClinicalDocuments({ patientId, limit: 50 });
    const foundAcrossPatients = await repository.findPatientClinicalDocumentById(
      otherPatientDocument.id,
      patientId,
    );

    expect(pageForA.items.length).toBeGreaterThan(0);
    expect(pageForA.items.every((item) => item.patientId === patientId)).toBe(true);
    expect(pageForA.items.map((item) => item.id)).not.toContain(otherPatientDocument.id);
    expect(foundAcrossPatients).toBeNull();
  });
});
