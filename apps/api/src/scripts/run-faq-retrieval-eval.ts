import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { EmbeddingService } from '../common/embedding/embedding.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ObjectStorageService } from '../common/storage/object-storage.service';
import { FAQ_RETRIEVAL_EVAL_CORPUS } from '../modules/document-management/eval/faq-retrieval-corpus';
import { FAQ_RETRIEVAL_EVAL_SET } from '../modules/document-management/eval/faq-retrieval-eval-set';
import {
  FaqRetrievalEvalObservation,
  FaqRetrievalEvalReport,
} from '../modules/document-management/eval/faq-retrieval-eval.types';
import { scoreFaqRetrieval } from '../modules/document-management/eval/score-faq-retrieval';
import { DocumentRepository } from '../modules/document-management/repository/document.repository';
import { CLINIC_DOCUMENT_STORAGE_KEY_PREFIX } from '../modules/document-management/service/clinic-document-storage-key-prefix';
import { DocumentIngestionService } from '../modules/document-management/service/document-ingestion.service';
import { FaqSearchService } from '../modules/document-management/service/faq-search.service';

/**
 * Runs the `P15-T12` / `PCS-T04` retrieval eval: seeds the fixture corpus,
 * ingests it on the configured embedding host, asks every golden question
 * through `search_faq`, and prints the metrics.
 *
 * Usage:
 *
 *   pnpm --filter @hms/api exec ts-node src/scripts/run-faq-retrieval-eval.ts
 *
 * Needs `DATABASE_URL` with pgvector, a reachable `OLLAMA_EMBEDDING_BASE_URL`
 * serving the configured model, and S3/MinIO credentials — the ingestion
 * pipeline reads each document back out of storage, so the corpus has to
 * genuinely be in the bucket rather than passed in memory.
 *
 * **Deliberately a script and not a test**, for the reason the tool-selection
 * eval is: it needs infrastructure CI does not have, it takes minutes rather
 * than seconds, and its result is a measurement to be recorded and compared
 * across releases — not a pass/fail gate. `staffOnlyLeakRate` is the one
 * exception in spirit, and it has an assertion-shaped counterpart in the
 * integration suite, where the scope predicate is pinned against real
 * Postgres. Record every run in `docs/customer-service/faq-retrieval-eval.md`
 * rather than overwriting, because the interesting number is how retrieval
 * moves between corpus and model changes.
 *
 * **It queries `search_faq`, not `DocumentRetrievalService`.** That is the
 * whole point: the eval measures what the WhatsApp/Telegram channel can
 * actually see, through the same output allowlist and the same pinned
 * visibility, rather than a richer view only the eval is entitled to.
 */
type SeededDocument = {
  slug: string;
  documentId: string;
  storageKey: string;
};

function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function printReport(model: string, version: string, report: FaqRetrievalEvalReport): void {
  process.stdout.write(`\nEmbedding model: ${model}@${version}\n`);
  process.stdout.write(`Cases: ${report.totalCases}\n`);
  process.stdout.write(`  Recall                : ${formatPercentage(report.recall)}\n`);
  process.stdout.write(`  Precision@1           : ${formatPercentage(report.precisionAtOne)}\n`);
  process.stdout.write(`  MRR                   : ${report.meanReciprocalRank.toFixed(3)}\n`);
  process.stdout.write(
    `  Cross-lingual recall  : ${formatPercentage(report.crossLingualRecall)}\n`,
  );
  process.stdout.write(`  False-answer rate     : ${formatPercentage(report.falseAnswerRate)}\n`);
  process.stdout.write(
    `  Staff-only leak rate  : ${formatPercentage(report.staffOnlyLeakRate)}${
      report.staffOnlyLeakRate > 0 ? '   *** SCOPE PREDICATE DEFECT ***' : ''
    }\n`,
  );
  process.stdout.write(`  Counts: ${JSON.stringify(report.counts)}\n\n`);
  // Every non-ideal case is printed with its id, because an aggregate that
  // dropped from 90% to 70% is not actionable until you can see which cases
  // moved.
  for (const result of report.results) {
    if (
      result.outcome === 'HIT_AT_ONE' ||
      result.outcome === 'CORRECT_SILENCE' ||
      result.outcome === 'STAFF_ONLY_WITHHELD'
    ) {
      continue;
    }
    process.stdout.write(
      `  ${result.caseId}: ${result.outcome}${
        result.expectedDocumentRank === null ? '' : ` (rank ${result.expectedDocumentRank})`
      }\n`,
    );
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const storage = app.get(ObjectStorageService);
  const documentRepository = app.get(DocumentRepository);
  const ingestionService = app.get(DocumentIngestionService);
  const faqSearchService = app.get(FaqSearchService);
  const embeddingService = app.get(EmbeddingService);
  const seeded: SeededDocument[] = [];
  let uploaderId = '';

  try {
    const uploader = await prisma.user.create({
      data: {
        email: `faq-retrieval-eval-${randomUUID()}@hms.local`,
        passwordHash: 'eval-only',
      },
    });
    uploaderId = uploader.id;

    process.stdout.write(`Seeding ${FAQ_RETRIEVAL_EVAL_CORPUS.length} documents`);
    for (const document of FAQ_RETRIEVAL_EVAL_CORPUS) {
      const storageKey = storage.generateObjectKey({
        keyPrefix: CLINIC_DOCUMENT_STORAGE_KEY_PREFIX,
        fileExtension: 'md',
      });
      await storage.uploadObject({
        key: storageKey,
        body: Buffer.from(document.body, 'utf8'),
        contentType: 'text/markdown',
      });
      const created = await documentRepository.createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        title: document.title,
        storageKey,
        mimeType: 'text/markdown',
        sizeBytes: Buffer.byteLength(document.body, 'utf8'),
        visibility: document.visibility,
        language: document.language,
        ingestStatus: 'PENDING',
        uploadedById: uploaderId,
      });
      seeded.push({ slug: document.slug, documentId: created.id, storageKey });
      process.stdout.write('.');
    }

    process.stdout.write('\nIngesting');
    // Claimed through the repository rather than ingested from the rows above,
    // so the PENDING → PROCESSING transition the service depends on is the
    // real one and not a hand-built record that skipped it.
    const claimed = await documentRepository.claimPendingDocuments(seeded.length);
    const seededIds = new Set(seeded.map((entry) => entry.documentId));
    for (const document of claimed.filter((candidate) => seededIds.has(candidate.id))) {
      const result = await ingestionService.ingestDocument(document);
      if (result.ingestStatus !== 'READY') {
        throw new Error(
          `Document "${document.title}" failed to ingest (${result.ingestError ?? 'unknown'}). The eval cannot measure retrieval over a corpus that is not in the index.`,
        );
      }
      process.stdout.write('.');
    }

    // `search_faq` returns titles, not ids — the channel's real output
    // allowlist — so grading maps title back to slug here rather than asking
    // retrieval for a richer shape the channel never sees.
    const slugByTitle = new Map(
      FAQ_RETRIEVAL_EVAL_CORPUS.map((document) => [document.title, document.slug]),
    );
    process.stdout.write('\nQuerying');
    const observations: FaqRetrievalEvalObservation[] = [];
    for (const evalCase of FAQ_RETRIEVAL_EVAL_SET) {
      const passages = await faqSearchService.searchFaq(evalCase.question);
      observations.push({
        caseId: evalCase.id,
        retrievedDocumentSlugs: passages.map(
          (passage) => slugByTitle.get(passage.documentTitle) ?? null,
        ),
      });
      process.stdout.write('.');
    }

    // Read off the service rather than the environment: the report's header is
    // the provenance of the numbers under it, and an env var says what was
    // requested while the service says what actually embedded the corpus.
    printReport(
      embeddingService.model,
      embeddingService.version,
      scoreFaqRetrieval(FAQ_RETRIEVAL_EVAL_SET, observations, FAQ_RETRIEVAL_EVAL_CORPUS),
    );
  } finally {
    // The corpus is torn down whatever happened. Leaving ten fixture
    // documents behind would silently join the next run's candidate set — and
    // a corpus that grows between runs makes the baseline uncomparable, which
    // is the one thing a fixed eval set exists to prevent.
    if (seeded.length > 0) {
      const documentIds = seeded.map((entry) => entry.documentId);
      await prisma.documentChunk.deleteMany({ where: { documentId: { in: documentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
      await Promise.all(
        seeded.map((entry) =>
          storage.deleteObject({ key: entry.storageKey }).catch(() => undefined),
        ),
      );
    }
    if (uploaderId !== '') {
      await prisma.user.deleteMany({ where: { id: uploaderId } });
    }
    await app.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`FAQ retrieval eval failed: ${err instanceof Error ? err.message : ''}\n`);
  process.exitCode = 1;
});
