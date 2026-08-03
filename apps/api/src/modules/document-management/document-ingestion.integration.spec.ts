import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { CreateDocumentChunkData } from '@hms/shared-types';

import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentChunkRepository } from './repository/document-chunk.repository';

/**
 * The one part of the ingestion pipeline no unit test can prove: that the
 * chunk write actually lands in Postgres.
 *
 * `embedding` and `search_vector` are `Unsupported` columns — Prisma can
 * express neither `vector(1024)` nor `tsvector` — so they are written through
 * raw SQL, which means the `::vector` cast, the `to_tsvector` call, and the
 * two enum casts are only ever checked by the database. A mocked Prisma would
 * accept all four happily and prove nothing.
 *
 * Runs against `DATABASE_URL` with pgvector installed (P15-T09).
 */
describe('Document chunk persistence against Postgres', () => {
  const EMBEDDING_DIMENSION = 1024;

  let prisma: PrismaService;
  let chunkRepository: DocumentChunkRepository;
  let uploaderId: string;
  let documentId: string;

  /** A deterministic unit-ish vector, distinct per seed so distances differ. */
  function buildEmbedding(seed: number): number[] {
    return Array.from({ length: EMBEDDING_DIMENSION }, (_unused, index) =>
      Number((Math.sin(seed + index) / 10).toFixed(6)),
    );
  }

  function buildChunk(overrides: Partial<CreateDocumentChunkData> = {}): CreateDocumentChunkData {
    return {
      chunkIndex: 0,
      content: 'Pendaftaran pasien BPJS dibuka pukul 07.00 di poliklinik umum.',
      embedding: buildEmbedding(1),
      embeddingModel: 'bge-m3',
      embeddingVersion: '1',
      visibility: 'BOTH',
      language: 'ID',
      ...overrides,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    chunkRepository = new DocumentChunkRepository(prisma);
    const uploader = await prisma.user.create({
      data: {
        email: `document-ingestion-${randomUUID()}@hms.test`,
        passwordHash: 'integration-test-only',
      },
    });
    uploaderId = uploader.id;
  });

  beforeEach(async () => {
    const document = await prisma.document.create({
      data: {
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'SOP Pendaftaran',
        storageKey: `documents/clinic/${randomUUID()}.md`,
        mimeType: 'text/markdown',
        sizeBytes: 4096,
        visibility: 'BOTH',
        language: 'ID',
        ingestStatus: 'PENDING',
        uploadedById: uploaderId,
      },
    });
    documentId = document.id;
  });

  afterEach(async () => {
    await prisma.documentChunk.deleteMany({ where: { documentId } });
    await prisma.document.deleteMany({ where: { id: documentId } });
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { uploadedById: uploaderId } });
    await prisma.user.deleteMany({ where: { id: uploaderId } });
    await prisma.$disconnect();
  });

  it('writes a full-width vector Postgres accepts and can compute a distance against', async () => {
    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [buildChunk()],
      ingestedAt: new Date(),
    });

    const actualRows = await prisma.$queryRaw<Array<{ dimensions: number; distance: number }>>`
      SELECT vector_dims("embedding") AS dimensions,
             ("embedding" <=> ${`[${buildEmbedding(1).join(',')}]`}::vector) AS distance
      FROM "document_chunks"
      WHERE "document_id" = ${documentId}::uuid
    `;

    expect(actualRows).toHaveLength(1);
    expect(Number(actualRows[0]?.dimensions)).toBe(EMBEDDING_DIMENSION);
    // Cosine distance to itself is zero — proof the stored vector round-trips
    // rather than merely being accepted as some vector of the right width.
    expect(Number(actualRows[0]?.distance)).toBeCloseTo(0, 6);
  });

  it('builds a search vector the same lexical config can query back', async () => {
    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [buildChunk()],
      ingestedAt: new Date(),
    });

    const actualMatches = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "document_chunks"
      WHERE "document_id" = ${documentId}::uuid
        AND "search_vector" @@ to_tsquery('simple', 'bpjs')
    `;

    expect(actualMatches).toHaveLength(1);
  });

  it('keeps an unstemmed term searchable, which is why the config is simple', async () => {
    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [buildChunk({ content: 'Amoxicillin 500 mg, kode ICD-10 J06.9, stok 20.' })],
      ingestedAt: new Date(),
    });

    const actualMatches = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "document_chunks"
      WHERE "document_id" = ${documentId}::uuid
        AND "search_vector" @@ to_tsquery('simple', 'amoxicillin & j06.9')
    `;

    // Drug names, strengths, and ICD codes are exactly what vectors are weak
    // at and full-text search is here to catch. A stemmer would mangle both.
    expect(actualMatches).toHaveLength(1);
  });

  it('replaces the whole chunk set instead of appending to it', async () => {
    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [
        buildChunk({ chunkIndex: 0, content: 'versi lama satu' }),
        buildChunk({ chunkIndex: 1, content: 'versi lama dua', embedding: buildEmbedding(2) }),
      ],
      ingestedAt: new Date(),
    });

    const actualCount = await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [buildChunk({ chunkIndex: 0, content: 'versi baru' })],
      ingestedAt: new Date(),
    });

    // Chunks are insert-only, so a re-ingest is a delete-then-insert. Without
    // the delete, the old passages would keep answering alongside the new.
    expect(actualCount).toBe(1);
    expect(await chunkRepository.countChunks(documentId)).toBe(1);
    const remaining = await prisma.documentChunk.findMany({ where: { documentId } });
    expect(remaining.map((chunk) => chunk.content)).toEqual(['versi baru']);
  });

  it('marks the document READY with its ingestion timestamp in the same transaction', async () => {
    const inputIngestedAt = new Date('2026-08-03T09:02:00.000Z');
    await prisma.document.update({
      where: { id: documentId },
      data: { ingestStatus: 'PROCESSING', ingestError: 'a previous attempt failed' },
    });

    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [buildChunk()],
      ingestedAt: inputIngestedAt,
    });

    const actualDocument = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(actualDocument.ingestStatus).toBe('READY');
    expect(actualDocument.ingestedAt).toEqual(inputIngestedAt);
    // A stale reason beside a successful ingest would read as a document that
    // is both working and broken.
    expect(actualDocument.ingestError).toBeNull();
  });

  it('persists the embedding model and version that produced each vector', async () => {
    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [buildChunk({ embeddingModel: 'bge-m3', embeddingVersion: '7' })],
      ingestedAt: new Date(),
    });

    const [actualChunk] = await prisma.documentChunk.findMany({ where: { documentId } });
    expect(actualChunk).toMatchObject({ embeddingModel: 'bge-m3', embeddingVersion: '7' });
  });

  it('leaves the corpus untouched when one chunk in the set is unwritable', async () => {
    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [buildChunk({ content: 'passage that already works' })],
      ingestedAt: new Date(),
    });

    await expect(
      chunkRepository.replaceDocumentChunks({
        documentId,
        chunks: [
          buildChunk({ chunkIndex: 0, content: 'new one' }),
          // A vector Postgres cannot store. The delete has already run inside
          // the transaction by this point, so only the rollback keeps the
          // document answering.
          buildChunk({ chunkIndex: 1, content: 'new two', embedding: [Number.NaN] }),
        ],
        ingestedAt: new Date(),
      }),
    ).rejects.toBeDefined();

    const remaining = await prisma.documentChunk.findMany({ where: { documentId } });
    expect(remaining.map((chunk) => chunk.content)).toEqual(['passage that already works']);
  });

  it('rejects a vector of the wrong width at the column rather than storing it', async () => {
    await expect(
      chunkRepository.replaceDocumentChunks({
        documentId,
        chunks: [buildChunk({ embedding: [0.1, 0.2, 0.3] })],
        ingestedAt: new Date(),
      }),
    ).rejects.toBeDefined();

    expect(await chunkRepository.countChunks(documentId)).toBe(0);
  });
});
