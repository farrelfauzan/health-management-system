import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { DocumentRecord, DocumentVisibilityValue } from '@hms/shared-types';

import { OllamaEmbeddingService } from '../../common/embedding/ollama-embedding.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3StorageService } from '../../common/storage/s3-storage.service';
import { DocumentChunkRepository } from './repository/document-chunk.repository';
import { DocumentRetrievalRepository } from './repository/document-retrieval.repository';
import { DocumentRepository } from './repository/document.repository';
import { CLINIC_DOCUMENT_STORAGE_KEY_PREFIX } from './service/clinic-document-storage-key-prefix';
import { DocumentIngestionService } from './service/document-ingestion.service';
import { DocumentRetrievalService } from './service/document-retrieval.service';

/**
 * PCS-T02 acceptance: the ingestion pipeline, composed.
 *
 * Every stage of extract → chunk → embed → store already has coverage, and
 * all of it is coverage of a stage in isolation.
 * `document-ingestion.service.spec.ts` drives the pipeline with
 * `ObjectStorageService` and `EmbeddingService` mocked;
 * `document-ingestion.integration.spec.ts` reaches real Postgres but calls
 * the chunk repository directly, bypassing the service; `extract-document-
 * text.spec.ts` parses a real PDF that never came from a bucket. Nothing
 * anywhere puts a file in storage at one end and asks a question at the
 * other, which is the only thing PCS-T02 actually promises.
 *
 * Three failures live exactly in the seams those tests do not cross, and each
 * one is invisible to a mock:
 *
 * - **The storage body is not a `Buffer` a test author made.** It is whatever
 *   the adapter reduces a provider's response stream to, and `pdf-parse` has
 *   to accept it. A mocked `getObject` returns a Buffer by construction and
 *   proves nothing about the real one.
 * - **The real model's vector width is only asserted against a real model.**
 *   `EmbeddingService` implementations must check the width they return
 *   against `dimension`; a stubbed embedder returns whatever width the stub
 *   was written with, so the check is tested against its own assumption.
 * - **Cross-lingual retrieval is the entire reason the embedder is `bge-m3`
 *   and local** (ai-chatbot-tools.md §5.4). A fake vector cannot exhibit it,
 *   so the property that justified the decision has never been observed.
 *
 * **Opt-in by design**, and gated separately from the app's own settings:
 * `S3_INTEGRATION_TEST_BUCKET` names a bucket this suite may write to, and
 * `EMBEDDING_INTEGRATION_TEST_BASE_URL` names a reachable Ollama serving the
 * configured model. Both are dedicated variables rather than `S3_BUCKET` and
 * `OLLAMA_EMBEDDING_BASE_URL` for the reason PCS-T01 gave: those two have
 * defaults, and keying off them would let a run with no test infrastructure
 * configured write fixtures into whatever bucket the app itself is pointed
 * at. Unset either and the suite skips, so a plain `pnpm integration:test`
 * stays green with no S3 and no Ollama.
 *
 * Postgres is not gated — every integration suite here already requires
 * `DATABASE_URL` with pgvector (P15-T09).
 */
const integrationTestBucket = process.env.S3_INTEGRATION_TEST_BUCKET ?? '';
const embeddingTestBaseUrl = process.env.EMBEDDING_INTEGRATION_TEST_BASE_URL ?? '';
const isConfigured = integrationTestBucket !== '' && embeddingTestBaseUrl !== '';
const describeWhenConfigured = isConfigured ? describe : describe.skip;

if (!isConfigured) {
  const missing = [
    integrationTestBucket === '' ? 'S3_INTEGRATION_TEST_BUCKET' : null,
    embeddingTestBaseUrl === '' ? 'EMBEDDING_INTEGRATION_TEST_BASE_URL' : null,
  ].filter((name): name is string => name !== null);
  console.warn(
    `[document-ingestion-pipeline.integration] skipped: set ${missing.join(' and ')} to run the ingestion pipeline against real storage and a real embedding host.`,
  );
}

describeWhenConfigured('Document ingestion pipeline end to end', () => {
  /**
   * Embedding a passage on a CPU-bound local Ollama is seconds, not
   * milliseconds, and a cold model load on the first call is longer still.
   */
  const PIPELINE_TIMEOUT_MS = 120_000;
  const MARKDOWN_CONTENT_TYPE = 'text/markdown';
  const PDF_CONTENT_TYPE = 'application/pdf';

  let prisma: PrismaService;
  let storageService: S3StorageService;
  let embeddingService: OllamaEmbeddingService;
  let documentRepository: DocumentRepository;
  let chunkRepository: DocumentChunkRepository;
  let ingestionService: DocumentIngestionService;
  let retrievalService: DocumentRetrievalService;
  let uploaderId: string;
  const createdDocumentIds: string[] = [];
  const createdStorageKeys: string[] = [];

  /**
   * A minimal but genuinely valid single-page PDF. Built inline rather than
   * committed as a fixture so the bytes under test are visible beside the
   * text they encode — and so "a PDF with no text layer" is expressible as
   * the same builder with nothing in its content stream, which is what a
   * scanned document looks like to a parser.
   */
  function buildSinglePagePdf(text: string): Buffer {
    const contentStream = text === '' ? '' : `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
    const pdf = [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
      `4 0 obj<</Length ${contentStream.length}>>stream`,
      contentStream,
      'endstream',
      'endobj',
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
      'trailer<</Root 1 0 R/Size 6>>',
      '',
    ].join('\n');
    return Buffer.from(pdf, 'latin1');
  }

  /**
   * Puts a real object in the bucket and records the `PENDING` row that names
   * it — the state an admin's confirmed upload leaves behind, reached the
   * same way the admin API reaches it rather than by writing the row alone.
   */
  async function storePendingDocument(params: {
    body: Buffer;
    contentType: string;
    fileExtension: string;
    visibility?: DocumentVisibilityValue;
    title?: string;
  }): Promise<DocumentRecord> {
    const storageKey = storageService.generateObjectKey({
      keyPrefix: CLINIC_DOCUMENT_STORAGE_KEY_PREFIX,
      fileExtension: params.fileExtension,
    });
    await storageService.uploadObject({
      key: storageKey,
      body: params.body,
      contentType: params.contentType,
    });
    createdStorageKeys.push(storageKey);
    const document = await documentRepository.createDocument({
      ownerType: 'CLINIC',
      ownerId: null,
      purpose: 'FAQ_KNOWLEDGE_BASE',
      title: params.title ?? 'SOP Pendaftaran',
      storageKey,
      mimeType: params.contentType,
      sizeBytes: params.body.byteLength,
      visibility: params.visibility ?? 'BOTH',
      language: 'ID',
      ingestStatus: 'PENDING',
      uploadedById: uploaderId,
    });
    createdDocumentIds.push(document.id);
    return document;
  }

  /**
   * Runs the pipeline the way the worker does — claim first, so the
   * `PENDING → PROCESSING` transition the service depends on is the real one
   * and not a hand-built record that skipped it.
   */
  async function ingestStoredDocument(documentId: string) {
    const claimed = await documentRepository.claimPendingDocuments(10);
    const target = claimed.find((document) => document.id === documentId);
    if (target === undefined) {
      throw new Error(`Document ${documentId} was not claimed; it was not PENDING`);
    }
    return ingestionService.ingestDocument(target);
  }

  beforeAll(async () => {
    // `||`, not `??`: CI expands an unconfigured secret to an empty string,
    // and an empty region is a hard startup error in `resolveStorageConfig`
    // rather than a request to use the default.
    const region = process.env.S3_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT ?? '';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? '';
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? '';
    const storageEnv: Record<string, string> = {
      S3_REGION: region,
      S3_BUCKET: integrationTestBucket,
      S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? 'false',
      ...(endpoint === '' ? {} : { S3_ENDPOINT: endpoint }),
      // Both or neither: `resolveStorageConfig` rejects a half-set pair
      // rather than silently falling back to the provider chain.
      ...(accessKeyId !== '' && secretAccessKey !== ''
        ? { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey }
        : {}),
    };
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    storageService = new S3StorageService(new ConfigService(storageEnv));
    embeddingService = new OllamaEmbeddingService(
      new ConfigService({ OLLAMA_EMBEDDING_BASE_URL: embeddingTestBaseUrl }),
    );
    documentRepository = new DocumentRepository(prisma);
    chunkRepository = new DocumentChunkRepository(prisma);
    ingestionService = new DocumentIngestionService(
      new ConfigService({}),
      documentRepository,
      chunkRepository,
      storageService,
      embeddingService,
    );
    retrievalService = new DocumentRetrievalService(
      new ConfigService({}),
      embeddingService,
      new DocumentRetrievalRepository(prisma),
    );
    // Prove the embedding host is reachable and serving the configured model
    // here, so a wrong base URL or an unpulled model reads as itself instead
    // of surfacing as an ingestion failure inside an assertion about text.
    await embeddingService.embedTexts({ texts: ['probe'] }).catch((err: unknown) => {
      throw new Error(
        `Embedding host at ${embeddingTestBaseUrl} did not answer for model "${embeddingService.model}". Check EMBEDDING_INTEGRATION_TEST_BASE_URL and that the model is pulled. Cause: ${String(err)}`,
      );
    });
    const uploader = await prisma.user.create({
      data: {
        email: `ingestion-pipeline-${randomUUID()}@hms.test`,
        passwordHash: 'integration-test-only',
      },
    });
    uploaderId = uploader.id;
  }, PIPELINE_TIMEOUT_MS);

  afterEach(async () => {
    await prisma.documentChunk.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
    await prisma.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    createdDocumentIds.length = 0;
    // Storage cleanup is best-effort and deliberately not asserted on: a
    // leftover object costs a lifecycle rule, while a throwing teardown
    // would mask the failure that led to it.
    await Promise.all(
      createdStorageKeys.splice(0).map((key) =>
        storageService.deleteObject({ key }).catch(() => undefined),
      ),
    );
  }, PIPELINE_TIMEOUT_MS);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: uploaderId } });
    await prisma.$disconnect();
  });

  it(
    'carries a markdown file from the bucket to a passage retrieval can find',
    async () => {
      const inputMarkdown = [
        '# SOP Pendaftaran Pasien',
        '',
        'Loket pendaftaran pasien BPJS dibuka pukul 07.00 dan tutup pukul 15.00.',
        'Pasien wajib membawa kartu BPJS dan rujukan yang masih berlaku.',
      ].join('\n');
      const document = await storePendingDocument({
        body: Buffer.from(inputMarkdown, 'utf8'),
        contentType: MARKDOWN_CONTENT_TYPE,
        fileExtension: 'md',
      });

      const actualResult = await ingestStoredDocument(document.id);

      expect(actualResult.ingestStatus).toBe('READY');
      expect(actualResult.ingestError).toBeNull();
      expect(actualResult.chunkCount).toBeGreaterThan(0);
      // The width the column is declared with, produced by the model rather
      // than by a stub that was written knowing the answer.
      const actualStoredChunks = await prisma.$queryRaw<
        Array<{ dimensions: number; embedding_model: string; embedding_version: string }>
      >`
        SELECT vector_dims("embedding") AS dimensions,
               "embedding_model", "embedding_version"
        FROM "document_chunks"
        WHERE "document_id" = ${document.id}::uuid
      `;
      expect(actualStoredChunks.length).toBe(actualResult.chunkCount);
      for (const chunk of actualStoredChunks) {
        expect(Number(chunk.dimensions)).toBe(embeddingService.dimension);
        expect(chunk.embedding_model).toBe(embeddingService.model);
        expect(chunk.embedding_version).toBe(embeddingService.version);
      }
      const actualPassages = await retrievalService.retrievePassages({
        query: 'jam buka loket pendaftaran BPJS',
        channelVisibility: 'PATIENT',
        ownerUserId: null,
      });
      expect(actualPassages.map((passage) => passage.documentId)).toContain(document.id);
    },
    PIPELINE_TIMEOUT_MS,
  );

  it(
    'carries a PDF the same way, on the body the storage adapter actually returns',
    async () => {
      const document = await storePendingDocument({
        body: buildSinglePagePdf('Poliklinik gigi buka setiap hari Selasa dan Kamis pukul 08.00.'),
        contentType: PDF_CONTENT_TYPE,
        fileExtension: 'pdf',
        title: 'Jadwal Poliklinik',
      });

      const actualResult = await ingestStoredDocument(document.id);

      // The assertion that needs real storage: a mocked `getObject` hands the
      // parser a Buffer the test author built, while the real one hands it
      // whatever the adapter reduced the provider's response stream to.
      expect(actualResult.ingestStatus).toBe('READY');
      expect(actualResult.chunkCount).toBeGreaterThan(0);
      const actualPassages = await retrievalService.retrievePassages({
        query: 'kapan poliklinik gigi buka',
        channelVisibility: 'PATIENT',
        ownerUserId: null,
      });
      expect(actualPassages.map((passage) => passage.documentId)).toContain(document.id);
    },
    PIPELINE_TIMEOUT_MS,
  );

  it(
    'answers an Indonesian question from an English passage',
    async () => {
      const document = await storePendingDocument({
        body: Buffer.from(
          'Patients may reschedule a confirmed appointment free of charge up to 24 hours before the visit.',
          'utf8',
        ),
        contentType: MARKDOWN_CONTENT_TYPE,
        fileExtension: 'md',
        title: 'Rescheduling Policy',
      });
      await ingestStoredDocument(document.id);

      const actualPassages = await retrievalService.retrievePassages({
        query: 'bisakah saya mengubah jadwal janji temu saya',
        channelVisibility: 'PATIENT',
        ownerUserId: null,
      });

      // This is the property that chose `bge-m3` and chose to run it locally
      // (ai-chatbot-tools.md §5.4), and it is not observable with fabricated
      // vectors. The lexical half cannot produce this hit — the question and
      // the passage share no term — so a match is the vector half doing the
      // thing the decision was made for.
      expect(actualPassages.map((passage) => passage.documentId)).toContain(document.id);
    },
    PIPELINE_TIMEOUT_MS,
  );

  it(
    'keeps a staff-only document out of a patient channel after a real ingest',
    async () => {
      const document = await storePendingDocument({
        body: Buffer.from(
          'Prosedur internal: eskalasi keluhan pasien ke supervisor klinik dalam 30 menit.',
          'utf8',
        ),
        contentType: MARKDOWN_CONTENT_TYPE,
        fileExtension: 'md',
        title: 'SOP Eskalasi Internal',
        visibility: 'DOCTOR',
      });
      await ingestStoredDocument(document.id);

      const [patientPassages, doctorPassages] = await Promise.all([
        retrievalService.retrievePassages({
          query: 'prosedur eskalasi keluhan pasien ke supervisor',
          channelVisibility: 'PATIENT',
          ownerUserId: null,
        }),
        retrievalService.retrievePassages({
          query: 'prosedur eskalasi keluhan pasien ke supervisor',
          channelVisibility: 'DOCTOR',
          ownerUserId: null,
        }),
      ]);

      // The parent's visibility is copied onto each chunk at ingest, and this
      // is that copy happening on the real path rather than in a stubbed row
      // the test wrote itself. The doctor half is asserted too, so the case
      // cannot pass because the document simply failed to ingest.
      expect(doctorPassages.map((passage) => passage.documentId)).toContain(document.id);
      expect(patientPassages.map((passage) => passage.documentId)).not.toContain(document.id);
    },
    PIPELINE_TIMEOUT_MS,
  );

  it(
    'fails a PDF with no text layer instead of publishing an empty document',
    async () => {
      const document = await storePendingDocument({
        body: buildSinglePagePdf(''),
        contentType: PDF_CONTENT_TYPE,
        fileExtension: 'pdf',
        title: 'Brosur Hasil Pindai',
      });

      const actualResult = await ingestStoredDocument(document.id);

      // A scanned PDF is the common real-world upload with no text layer.
      // READY with zero chunks would claim to be searchable and answer
      // nothing, which is the failure an admin cannot see.
      expect(actualResult.ingestStatus).toBe('FAILED');
      expect(actualResult.chunkCount).toBe(0);
      expect(actualResult.ingestError).toBe('No text could be extracted from this document');
      const actualChunkCount = await prisma.documentChunk.count({
        where: { documentId: document.id },
      });
      expect(actualChunkCount).toBe(0);
    },
    PIPELINE_TIMEOUT_MS,
  );
});
