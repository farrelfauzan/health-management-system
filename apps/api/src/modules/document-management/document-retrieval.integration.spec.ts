import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  CreateDocumentChunkData,
  DocumentLanguageValue,
  DocumentOwnerTypeValue,
  DocumentPurposeValue,
  DocumentVisibilityValue,
  RetrieveDocumentChunksParams,
} from '@hms/shared-types';

import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentChunkRepository } from './repository/document-chunk.repository';
import { DocumentRetrievalRepository } from './repository/document-retrieval.repository';

/**
 * P15-T11's scope predicate, proven against Postgres rather than against a
 * mock.
 *
 * These are the cases a unit test structurally cannot make: `<=>`, `@@`,
 * `websearch_to_tsquery` and the enum casts only exist in the database, and
 * every claim below — a staff-only SOP is unreachable from a patient session,
 * another doctor's knowledge base is not in the candidate set, a stale
 * embedding model is excluded from the vector half — is a claim about what
 * that SQL returns. A mocked Prisma would return whatever it was told to.
 *
 * The isolation cases assert on the **repository query**, deliberately, not
 * on the ranked output: "another doctor's document did not appear in the top
 * five" is a statement about ranking; "it was never a candidate" is a
 * statement about access control, and only one of them stays true when the
 * corpus grows.
 *
 * Runs against `DATABASE_URL` with pgvector installed (P15-T09).
 */
describe('Hybrid document retrieval against Postgres', () => {
  const EMBEDDING_DIMENSION = 1024;
  const EMBEDDING_MODEL = 'bge-m3';
  const EMBEDDING_VERSION = '1';

  let prisma: PrismaService;
  let chunkRepository: DocumentChunkRepository;
  let retrievalRepository: DocumentRetrievalRepository;
  let uploaderId: string;
  let doctorId: string;
  let otherDoctorId: string;
  const createdDocumentIds: string[] = [];

  /**
   * A deterministic vector whose direction depends only on the seed, so two
   * chunks built from the same seed are identical and chunks from different
   * seeds are measurably apart. Not a real embedding — the point of these
   * cases is the predicate and the ordering, not semantic quality.
   */
  function buildEmbedding(seed: number): number[] {
    return Array.from({ length: EMBEDDING_DIMENSION }, (_unused, index) =>
      Number(Math.sin(seed * 7 + index).toFixed(6)),
    );
  }

  async function createDocument(overrides: {
    ownerType: DocumentOwnerTypeValue;
    ownerId: string | null;
    purpose: DocumentPurposeValue;
    visibility?: DocumentVisibilityValue;
    language?: DocumentLanguageValue;
    title?: string;
    deleted?: boolean;
  }): Promise<string> {
    const document = await prisma.document.create({
      data: {
        ownerType: overrides.ownerType,
        ownerId: overrides.ownerId,
        purpose: overrides.purpose,
        title: overrides.title ?? 'SOP Pendaftaran',
        storageKey: `documents/${randomUUID()}.md`,
        mimeType: 'text/markdown',
        sizeBytes: 2048,
        visibility: overrides.visibility ?? 'BOTH',
        language: overrides.language ?? 'ID',
        ingestStatus: 'READY',
        uploadedById: uploaderId,
        ...(overrides.deleted === true ? { deletedAt: new Date() } : {}),
      },
    });
    createdDocumentIds.push(document.id);
    return document.id;
  }

  async function writeChunk(
    documentId: string,
    overrides: Partial<CreateDocumentChunkData> = {},
  ): Promise<void> {
    await chunkRepository.replaceDocumentChunks({
      documentId,
      chunks: [
        {
          chunkIndex: 0,
          content: 'Pendaftaran pasien BPJS dibuka pukul 07.00 di poliklinik umum.',
          embedding: buildEmbedding(1),
          embeddingModel: EMBEDDING_MODEL,
          embeddingVersion: EMBEDDING_VERSION,
          visibility: 'BOTH',
          language: 'ID',
          ...overrides,
        },
      ],
      ingestedAt: new Date(),
    });
  }

  function buildSearchParams(
    overrides: Partial<RetrieveDocumentChunksParams> = {},
  ): RetrieveDocumentChunksParams {
    return {
      queryText: 'pendaftaran BPJS',
      queryEmbedding: buildEmbedding(1),
      embeddingModel: EMBEDDING_MODEL,
      embeddingVersion: EMBEDDING_VERSION,
      channelVisibility: 'DOCTOR',
      ownerUserId: doctorId,
      candidateLimit: 20,
      ...overrides,
    };
  }

  /** Both halves, so no case can pass because only one of them filtered. */
  async function searchBothHalves(
    params: RetrieveDocumentChunksParams,
  ): Promise<{ vector: string[]; lexical: string[] }> {
    const [vector, lexical] = await Promise.all([
      retrievalRepository.searchByVector(params),
      retrievalRepository.searchByFullText(params),
    ]);
    return {
      vector: vector.map((candidate) => candidate.documentId),
      lexical: lexical.map((candidate) => candidate.documentId),
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    chunkRepository = new DocumentChunkRepository(prisma);
    retrievalRepository = new DocumentRetrievalRepository(prisma);
    const [uploader, doctor, otherDoctor] = await Promise.all([
      prisma.user.create({
        data: { email: `retrieval-uploader-${randomUUID()}@hms.test`, passwordHash: 'test-only' },
      }),
      prisma.user.create({
        data: { email: `retrieval-doctor-${randomUUID()}@hms.test`, passwordHash: 'test-only' },
      }),
      prisma.user.create({
        data: { email: `retrieval-other-${randomUUID()}@hms.test`, passwordHash: 'test-only' },
      }),
    ]);
    uploaderId = uploader.id;
    doctorId = doctor.id;
    otherDoctorId = otherDoctor.id;
  });

  afterEach(async () => {
    await prisma.documentChunk.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
    await prisma.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    createdDocumentIds.length = 0;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [uploaderId, doctorId, otherDoctorId] } } });
    await prisma.$disconnect();
  });

  describe('scope predicate', () => {
    it('never makes a staff-only clinic chunk a candidate for a patient session', async () => {
      const staffOnly = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility: 'DOCTOR',
      });
      await writeChunk(staffOnly, { visibility: 'DOCTOR' });

      const actual = await searchBothHalves(
        buildSearchParams({ channelVisibility: 'PATIENT', ownerUserId: null }),
      );

      expect(actual.vector).toEqual([]);
      expect(actual.lexical).toEqual([]);
    });

    it('admits a BOTH-visibility clinic chunk to either channel', async () => {
      const shared = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility: 'BOTH',
      });
      await writeChunk(shared, { visibility: 'BOTH' });

      const patientView = await searchBothHalves(
        buildSearchParams({ channelVisibility: 'PATIENT', ownerUserId: null }),
      );
      const doctorView = await searchBothHalves(buildSearchParams({ channelVisibility: 'DOCTOR' }));

      expect(patientView.vector).toEqual([shared]);
      expect(patientView.lexical).toEqual([shared]);
      expect(doctorView.vector).toEqual([shared]);
      expect(doctorView.lexical).toEqual([shared]);
    });

    it('never makes another doctor’s knowledge base a candidate', async () => {
      const foreignKnowledgeBase = await createDocument({
        ownerType: 'DOCTOR',
        ownerId: otherDoctorId,
        purpose: 'PERSONAL_KNOWLEDGE_BASE',
        title: 'Catatan dr. Lain',
      });
      await writeChunk(foreignKnowledgeBase);

      const actual = await searchBothHalves(buildSearchParams({ ownerUserId: doctorId }));

      // Not "ranked below the clinic corpus" — absent from the candidate set,
      // which is what stays true when the corpus grows (§5.5).
      expect(actual.vector).toEqual([]);
      expect(actual.lexical).toEqual([]);
    });

    it('includes the asking doctor’s own knowledge base alongside the clinic corpus', async () => {
      const clinicDocument = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
      });
      const ownKnowledgeBase = await createDocument({
        ownerType: 'DOCTOR',
        ownerId: doctorId,
        purpose: 'PERSONAL_KNOWLEDGE_BASE',
        title: 'Catatan saya',
      });
      await writeChunk(clinicDocument);
      await writeChunk(ownKnowledgeBase);

      const actual = await searchBothHalves(buildSearchParams({ ownerUserId: doctorId }));

      expect(actual.vector.sort()).toEqual([clinicDocument, ownKnowledgeBase].sort());
      expect(actual.lexical.sort()).toEqual([clinicDocument, ownKnowledgeBase].sort());
    });

    it('marks a personal chunk’s source tier so the citation can say whose document it is', async () => {
      const ownKnowledgeBase = await createDocument({
        ownerType: 'DOCTOR',
        ownerId: doctorId,
        purpose: 'PERSONAL_KNOWLEDGE_BASE',
        title: 'Catatan saya',
        language: 'EN',
      });
      await writeChunk(ownKnowledgeBase, { language: 'EN' });

      const actual = await retrievalRepository.searchByVector(
        buildSearchParams({ ownerUserId: doctorId }),
      );

      expect(actual).toHaveLength(1);
      expect(actual[0]).toMatchObject({
        sourceTier: 'PERSONAL',
        documentTitle: 'Catatan saya',
        language: 'EN',
        rank: 1,
      });
    });

    it('contributes no personal corpus at all when the channel passes no owner', async () => {
      const someonesKnowledgeBase = await createDocument({
        ownerType: 'DOCTOR',
        ownerId: doctorId,
        purpose: 'PERSONAL_KNOWLEDGE_BASE',
      });
      await writeChunk(someonesKnowledgeBase);

      const actual = await searchBothHalves(
        buildSearchParams({ channelVisibility: 'PATIENT', ownerUserId: null }),
      );

      // `owner_id = NULL` is not a filter anyone should have to reason about,
      // so the predicate states the null case explicitly. This pins it.
      expect(actual.vector).toEqual([]);
      expect(actual.lexical).toEqual([]);
    });

    it('excludes a soft-deleted document from both halves', async () => {
      const retired = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
      });
      // Chunks are written first, then the parent retired — the ordering a
      // soft delete cannot control, since `softDeleteDocument` hard-deletes
      // the chunks precisely because this query never joins for them.
      await writeChunk(retired);
      await prisma.document.update({ where: { id: retired }, data: { deletedAt: new Date() } });

      const actual = await searchBothHalves(buildSearchParams());

      expect(actual.vector).toEqual([]);
      expect(actual.lexical).toEqual([]);
    });

    it('never retrieves a GENERAL document, which is stored but never a knowledge base', async () => {
      const generalDocument = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'GENERAL',
      });
      await writeChunk(generalDocument);

      const actual = await searchBothHalves(buildSearchParams());

      expect(actual.vector).toEqual([]);
      expect(actual.lexical).toEqual([]);
    });
  });

  describe('the two halves', () => {
    it('orders the vector half by cosine distance to the question', async () => {
      const near = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Dekat',
      });
      const far = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Jauh',
      });
      await writeChunk(near, { embedding: buildEmbedding(1) });
      await writeChunk(far, { embedding: buildEmbedding(9) });

      const actual = await retrievalRepository.searchByVector(
        buildSearchParams({ queryEmbedding: buildEmbedding(1) }),
      );

      expect(actual.map((candidate) => candidate.documentId)).toEqual([near, far]);
      expect(actual.map((candidate) => candidate.rank)).toEqual([1, 2]);
    });

    it('excludes chunks left behind by a superseded embedding model from the vector half', async () => {
      const stale = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Diindeks model lama',
      });
      await writeChunk(stale, { embeddingModel: 'nomic-embed-text', embeddingVersion: '1' });

      const actual = await searchBothHalves(buildSearchParams());

      // The whole reason `embedding_model`/`embedding_version` are columns:
      // Postgres will happily compute a distance across two vector spaces and
      // return a confident, meaningless number (§5.4).
      expect(actual.vector).toEqual([]);
      // The lexical half is unaffected — its index has nothing to do with the
      // embedding space, so a stale document stays findable by exact term
      // until it is re-ingested.
      expect(actual.lexical).toEqual([stale]);
    });

    it('excludes chunks embedded by the same model at a different version', async () => {
      const stale = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
      });
      await writeChunk(stale, { embeddingVersion: '2' });

      const actual = await retrievalRepository.searchByVector(buildSearchParams());

      expect(actual).toEqual([]);
    });

    it('finds an exact drug name and strength the lexical half exists for', async () => {
      const formulary = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Formularium',
      });
      const unrelated = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Jam Operasional',
      });
      await writeChunk(formulary, {
        content: 'Amoxicillin 500mg kapsul tersedia untuk infeksi saluran napas ringan.',
      });
      await writeChunk(unrelated, {
        content: 'Klinik buka pukul 08.00 sampai 14.00 setiap hari kerja.',
      });

      const actual = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: 'Amoxicillin 500mg' }),
      );

      expect(actual.map((candidate) => candidate.documentId)).toEqual([formulary]);
    });

    it('answers a whole conversational question rather than requiring every word of it', async () => {
      const referral = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Rujukan',
      });
      await writeChunk(referral, { content: 'Rujukan BPJS berlaku selama 30 hari sejak terbit.' });

      // The case that rules out every AND-combining query builder Postgres
      // ships: none of "berapa", "lama", "mohon" or "info" appears in the
      // passage, and `simple` keeps stopwords rather than dropping them, so an
      // AND query would answer nothing at all here.
      const actual = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: 'Rujukan BPJS — berlaku berapa lama?? (mohon info)' }),
      );

      expect(actual.map((candidate) => candidate.documentId)).toEqual([referral]);
    });

    it('ranks the passage sharing the question’s rare terms above one sharing only its filler', async () => {
      const formulary = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Formularium',
      });
      const filler = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: 'Jam Operasional',
      });
      await writeChunk(formulary, {
        content: 'Amoxicillin 500mg kapsul tersedia di apotek klinik untuk dewasa.',
      });
      await writeChunk(filler, {
        content: 'Apakah kami punya jadwal khusus di apotek? Kami punya jadwal setiap hari.',
      });

      const actual = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: 'Apakah kami punya Amoxicillin 500mg di apotek?' }),
      );

      // OR semantics let the filler passage in as a candidate — that is the
      // price of answering conversational questions at all — but the passage
      // carrying the drug name must still come first.
      expect(actual[0]?.documentId).toBe(formulary);
    });

    it('treats query operators in a chat message as ordinary words', async () => {
      const document = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
      });
      await writeChunk(document, { content: 'Kode diagnosis J18.9 dipakai untuk pneumonia.' });

      // Lexing the question with `to_tsvector` before rebuilding the query is
      // what makes this safe: the parser never sees an operator it did not
      // write itself.
      const actual = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: "!J18.9 & -pneumonia | 'kode' <-> ??" }),
      );

      expect(actual.map((candidate) => candidate.documentId)).toEqual([document]);
    });

    it('searches for the question’s content words and not its filler, in either language', async () => {
      const document = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
      });
      await writeChunk(document, { content: 'Vaksinasi influenza tersedia setiap Rabu.' });

      // Filler only — English through the `english` configuration's stopword
      // list, Indonesian through ours, since Postgres ships none for it.
      const englishFiller = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: 'do we have the a an in of' }),
      );
      const indonesianFiller = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: 'apakah kami punya yang di dan untuk' }),
      );
      // The same question with one content word in it finds the passage.
      const withContent = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: 'apakah kami punya vaksinasi?' }),
      );

      expect(englishFiller).toEqual([]);
      expect(indonesianFiller).toEqual([]);
      expect(withContent.map((candidate) => candidate.documentId)).toEqual([document]);
    });

    it('returns nothing rather than everything when the question has no matching term', async () => {
      const document = await createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
      });
      await writeChunk(document);

      const actual = await retrievalRepository.searchByFullText(
        buildSearchParams({ queryText: 'kolam renang hidroterapi' }),
      );

      expect(actual).toEqual([]);
    });

    it('honours the candidate limit on both halves', async () => {
      for (const seed of [1, 2, 3]) {
        const document = await createDocument({
          ownerType: 'CLINIC',
          ownerId: null,
          purpose: 'FAQ_KNOWLEDGE_BASE',
        });
        await writeChunk(document, { embedding: buildEmbedding(seed) });
      }

      const actual = await searchBothHalves(buildSearchParams({ candidateLimit: 2 }));

      expect(actual.vector).toHaveLength(2);
      expect(actual.lexical).toHaveLength(2);
    });
  });
});
