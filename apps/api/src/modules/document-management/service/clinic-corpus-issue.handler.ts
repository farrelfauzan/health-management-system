import { Inject, Injectable, OnModuleInit, UnprocessableEntityException, forwardRef } from '@nestjs/common';

import { DocumentTypeBehaviorValue } from '@hms/shared-types';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { DocumentIssueBehaviorService } from '../../managed-document/service/document-issue-behavior.service';
import {
  DocumentIssueBehaviorHandler,
  DocumentIssueContext,
} from '../../managed-document/service/document-issue-behavior.types';
import { DocumentRepository } from '../repository/document.repository';

export const CLINIC_CORPUS_SUBJECT_MISSING_ERROR_CODE = 'CLINIC_CORPUS_SUBJECT_MISSING';

/**
 * The `CLINIC_CORPUS` arm of the issue behaviour (`P16-T33`, FR-E5-16/19).
 *
 * Approving a corpus document's registry row is what releases the file to
 * the ingestion worker: `ingestStatus` goes to `PENDING` inside the
 * decision's own transaction, and the pipeline that has existed since
 * `P15-T10` takes it from there. Ingestion stays the corpus's own concern
 * (§7.5.3) — this handler decides *when* it may start, never how it runs.
 *
 * The ordering matters and it is the reason the release is not done
 * afterwards: a worker that claimed the row before the `ISSUED` status
 * committed would ingest a document the registry still calls pending, and
 * the retrieval predicate would then exclude the very chunks it had just
 * paid to embed.
 */
@Injectable()
export class ClinicCorpusIssueHandler implements DocumentIssueBehaviorHandler, OnModuleInit {
  readonly behavior: DocumentTypeBehaviorValue = 'CLINIC_CORPUS';

  constructor(
    @Inject(forwardRef(() => DocumentIssueBehaviorService))
    private readonly issueBehaviorService: DocumentIssueBehaviorService,
    private readonly documentRepository: DocumentRepository,
  ) {}

  onModuleInit(): void {
    this.issueBehaviorService.registerHandler(this);
  }

  async executeIssue(context: DocumentIssueContext, tx: PrismaTransactionClient): Promise<void> {
    const documentId = context.document.subjectDocumentId;
    if (documentId === null) {
      throw new UnprocessableEntityException({
        message: 'This document is typed as a clinic-corpus document but names no stored file',
        code: CLINIC_CORPUS_SUBJECT_MISSING_ERROR_CODE,
      });
    }
    await this.documentRepository.releaseToIngestionQueue(tx, documentId);
  }
}
