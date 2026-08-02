-- P15-T10: the shared document store (ai-chatbot-tools.md §5.5,
-- customer-service strategy §4.3). One table serves the clinic FAQ corpus,
-- the Phase 15 retrieval corpora, personal knowledge bases, and the future
-- patient/doctor document features — one ingestion pipeline, one embedding
-- space, one S3 layout.
--
-- Builds on 20260817000000_pgvector_extension, which installed `vector`
-- alone so an environment surprise surfaced there rather than here.
--
-- Two column types Prisma cannot express are written by hand below and must
-- stay in sync with the `Unsupported(...)` fields in schema.prisma:
--   * `embedding vector(1024)` — bge-m3's dimension, fixed in the column
--     type. Changing embedding model is a schema change, not a config change.
--   * `search_vector tsvector` — written by the repository in the same
--     statement as `content`. A `GENERATED ALWAYS AS` column would keep the
--     two in step automatically, and was the first attempt, but Prisma models
--     a generated column as a plain column default: CI's
--     `migrate diff --exit-code` drift gate then reports
--     `ALTER COLUMN "search_vector" DROP DEFAULT` on every run and fails.
--     Verified against a fresh pgvector container before settling here.

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('CLINIC', 'PATIENT', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "DocumentPurpose" AS ENUM ('FAQ_KNOWLEDGE_BASE', 'PERSONAL_KNOWLEDGE_BASE', 'GENERAL');

-- CreateEnum
CREATE TYPE "DocumentIngestStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PATIENT', 'DOCTOR', 'BOTH');

-- CreateEnum
CREATE TYPE "DocumentLanguage" AS ENUM ('ID', 'EN');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "owner_type" "DocumentOwnerType" NOT NULL,
    "owner_id" UUID,
    "purpose" "DocumentPurpose" NOT NULL,
    "title" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'BOTH',
    "language" "DocumentLanguage" NOT NULL DEFAULT 'ID',
    "ingest_status" "DocumentIngestStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "ingest_error" TEXT,
    "ingested_at" TIMESTAMP(3),
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "search_vector" tsvector,
    "embedding_model" TEXT NOT NULL,
    "embedding_version" TEXT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'BOTH',
    "language" "DocumentLanguage" NOT NULL DEFAULT 'ID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_owner_type_owner_id_idx" ON "documents"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "documents_purpose_ingest_status_idx" ON "documents"("purpose", "ingest_status");

-- CreateIndex
CREATE INDEX "documents_uploaded_by_id_idx" ON "documents"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_id_chunk_index_key" ON "document_chunks"("document_id", "chunk_index");

-- The lexical half of hybrid retrieval (§5.3). `simple` rather than
-- `indonesian` or `english` is chosen at query and write time, not here: the
-- corpus is bilingual in one column, so a language-specific stemmer would be
-- wrong for half of it, and the exact terms this half exists to catch — drug
-- names, ICD codes, BPJS terminology — need no stemming.
--
-- Declared in schema.prisma as `@@index([searchVector], type: Gin)` so the
-- drift gate can see it.
CREATE INDEX "document_chunks_search_vector_idx" ON "document_chunks" USING gin ("search_vector");

-- NO HNSW INDEX ON `embedding`, DELIBERATELY. Prisma cannot express one, and
-- CI runs `prisma migrate diff --exit-code` as a drift gate — an index only
-- the database knows about fails that check on every subsequent run, so
-- creating one here would trade a working pipeline for a red build.
--
-- The cost is bounded and the tradeoff is the right way round at this size: a
-- sequential scan over a clinic corpus of a few thousand chunks is
-- milliseconds, and it is **exact**, where HNSW is approximate — perfect
-- recall is worth more than latency while the evaluation set (P15-T12) is
-- establishing the recall baseline everything else is judged against. P15-T11
-- revisits this with a measurement rather than an assumption; if an index is
-- warranted, the honest fix is to teach the drift gate about objects Prisma
-- cannot model, not to skip indexing forever.

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
