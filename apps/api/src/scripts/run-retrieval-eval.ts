import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { PrismaService } from '../common/prisma/prisma.service';
import { EmbeddingService } from '../common/embedding/embedding.service';
import { AppModule } from '../app.module';
import {
  RETRIEVAL_EVAL_DOCUMENTS,
  RETRIEVAL_EVAL_SET,
} from '../modules/document-management/eval/retrieval-eval-set';
import { scoreRetrieval } from '../modules/document-management/eval/score-retrieval';
import {
  RetrievalEvalObservation,
  RetrievalEvalReport,
} from '../modules/document-management/eval/retrieval-eval.types';
import { DocumentChunkRepository } from '../modules/document-management/repository/document-chunk.repository';
import { DocumentRetrievalService } from '../modules/document-management/service/document-retrieval.service';

/**
 * Runs the `P15-T12` retrieval evaluation against a **freshly seeded fixture
 * corpus** and prints the §5.2 baseline metrics.
 *
 * Usage:
 *
 *   pnpm --filter @hms/api exec ts-node src/scripts/run-retrieval-eval.ts
 *
 * Needs `DATABASE_URL` pointing at a pgvector database and a reachable
 * `OLLAMA_EMBEDDING_BASE_URL` with the configured model pulled. It is a
 * script rather than a test for exactly that reason: it depends on a live
 * model, it is not deterministic across model versions, and its whole purpose
 * is to produce a number to write down.
 *
 * **The corpus is seeded and torn down by this script**, not assumed. An
 * evaluation run against whatever documents happened to be in the database
 * measures that database rather than the retriever, and could not be compared
 * against a run on another machine. Every fixture document is written under
 * one owner and removed in the `finally` block.
 *
 * Each chunk is one document: these fixtures are short enough that chunking
 * them would measure the splitter rather than the retrieval, and the splitter
 * has its own unit tests.
 */
function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function printReport(model: string, report: RetrievalEvalReport): void {
  process.stdout.write(`\nEmbedding model: ${model}\n`);
  process.stdout.write(`Cases: ${report.totalCases}\n`);
  process.stdout.write(`  Recall              : ${formatPercentage(report.recallRate)}\n`);
  process.stdout.write(`  Ranked first        : ${formatPercentage(report.rankFirstRate)}\n`);
  process.stdout.write(`  MRR                 : ${report.meanReciprocalRank.toFixed(3)}\n`);
  process.stdout.write(
    `  Same-language recall: ${formatPercentage(report.sameLanguageRecallRate)}\n`,
  );
  process.stdout.write(
    `  CROSS-LINGUAL recall: ${formatPercentage(report.crossLingualRecallRate)} over ${report.crossLingualCaseCount} cases\n`,
  );
  process.stdout.write(
    `  Cross-lingual MRR   : ${report.crossLingualMeanReciprocalRank.toFixed(3)}\n\n`,
  );
  for (const result of report.results) {
    if (result.didRankFirst) {
      continue;
    }
    process.stdout.write(
      `  ${result.caseId}: ${result.didRecall ? `rank ${String(result.bestRank)}` : 'MISS'}${
        result.isCrossLingual ? ' (cross-lingual)' : ''
      }\n`,
    );
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const embeddingService = app.get(EmbeddingService);
  const chunkRepository = app.get(DocumentChunkRepository);
  const retrievalService = app.get(DocumentRetrievalService);
  const uploaderEmail = `retrieval-eval-${randomUUID()}@hms.test`;
  const documentIdByKey = new Map<string, string>();
  let uploaderId = '';
  try {
    const uploader = await prisma.user.create({
      data: { email: uploaderEmail, passwordHash: 'eval-only' },
    });
    uploaderId = uploader.id;
    const embedded = await embeddingService.embedTexts({
      texts: RETRIEVAL_EVAL_DOCUMENTS.map((document) => document.content),
    });
    for (const [index, document] of RETRIEVAL_EVAL_DOCUMENTS.entries()) {
      const row = await prisma.document.create({
        data: {
          ownerType: 'CLINIC',
          ownerId: null,
          purpose: 'FAQ_KNOWLEDGE_BASE',
          title: document.title,
          storageKey: `documents/eval/${randomUUID()}.md`,
          mimeType: 'text/markdown',
          sizeBytes: document.content.length,
          visibility: document.visibility,
          language: document.language,
          ingestStatus: 'PENDING',
          uploadedById: uploaderId,
        },
      });
      documentIdByKey.set(document.key, row.id);
      await chunkRepository.replaceDocumentChunks({
        documentId: row.id,
        chunks: [
          {
            chunkIndex: 0,
            content: document.content,
            embedding: [...(embedded.embeddings[index] ?? [])],
            embeddingModel: embedded.model,
            embeddingVersion: embedded.version,
            visibility: document.visibility,
            language: document.language,
          },
        ],
        ingestedAt: new Date(),
      });
    }
    const keyByDocumentId = new Map(
      [...documentIdByKey.entries()].map(([key, id]) => [id, key]),
    );
    const observations: RetrievalEvalObservation[] = [];
    for (const evalCase of RETRIEVAL_EVAL_SET) {
      // The doctor channel, so `DOCTOR`-visibility fixtures are reachable —
      // a patient-channel run would measure the visibility filter instead.
      const passages = await retrievalService.retrievePassages({
        query: evalCase.question,
        channelVisibility: 'DOCTOR',
        ownerUserId: null,
      });
      observations.push({
        caseId: evalCase.id,
        retrievedDocumentKeys: passages
          .map((passage) => keyByDocumentId.get(passage.documentId))
          .filter((key): key is string => key !== undefined),
      });
      process.stdout.write('.');
    }
    printReport(embeddingService.model, scoreRetrieval(RETRIEVAL_EVAL_SET, observations));
  } finally {
    const documentIds = [...documentIdByKey.values()];
    if (documentIds.length > 0) {
      await prisma.documentChunk.deleteMany({ where: { documentId: { in: documentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    }
    if (uploaderId !== '') {
      await prisma.user.deleteMany({ where: { id: uploaderId } });
    }
    await app.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Retrieval eval failed: ${err instanceof Error ? err.message : ''}\n`);
  process.exitCode = 1;
});
