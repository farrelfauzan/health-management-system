import { Inject, Injectable, OnModuleInit, UnprocessableEntityException, forwardRef } from '@nestjs/common';

import { DocumentTypeBehaviorValue } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { DocumentIssueBehaviorService } from '../../managed-document/service/document-issue-behavior.service';
import {
  DocumentIssueBehaviorHandler,
  DocumentIssueContext,
} from '../../managed-document/service/document-issue-behavior.types';
import { DocumentTemplateRepository } from '../repository/document-template.repository';

const TEMPLATE_AUDIT_RESOURCE = 'document-template';

export const TEMPLATE_SUBJECT_MISSING_ERROR_CODE = 'DOCUMENT_TEMPLATE_SUBJECT_MISSING';

/**
 * The `INVOICE_TEMPLATE` arm of the issue behaviour (`P16-T32`, FR-E5-16).
 *
 * Approving a template's registry row **is** publishing the template: the
 * frozen HTML becomes a new `DocumentTemplateVersion` inside the decision's
 * own transaction, and the version row records which decision released it.
 * That link is the audit trail NFR-AUD-03 asks for — from the approver, to
 * the version, to the receipt a patient was handed.
 *
 * It registers itself with the registry module rather than being injected
 * there. The dependency runs this way round: templates already read the
 * registry's type policy to decide whether publishing needs approval at all,
 * and injecting this handler into `managed-document` would close that loop
 * for nothing.
 */
@Injectable()
export class InvoiceTemplateIssueHandler implements DocumentIssueBehaviorHandler, OnModuleInit {
  readonly behavior: DocumentTypeBehaviorValue = 'INVOICE_TEMPLATE';

  constructor(
    @Inject(forwardRef(() => DocumentIssueBehaviorService))
    private readonly issueBehaviorService: DocumentIssueBehaviorService,
    private readonly documentTemplateRepository: DocumentTemplateRepository,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit(): void {
    this.issueBehaviorService.registerHandler(this);
  }

  async executeIssue(context: DocumentIssueContext, tx: PrismaTransactionClient): Promise<void> {
    const templateId = context.document.subjectTemplateId;
    if (templateId === null) {
      throw new UnprocessableEntityException({
        message: 'This document is typed as an invoice template but names no template',
        code: TEMPLATE_SUBJECT_MISSING_ERROR_CODE,
      });
    }
    const contentHtml = context.issuedContent.contentHtml;
    if (contentHtml === null || contentHtml.trim() === '') {
      throw new UnprocessableEntityException({
        message: 'A template with no content cannot be published',
        code: TEMPLATE_SUBJECT_MISSING_ERROR_CODE,
      });
    }
    await this.documentTemplateRepository.publishFrozenVersion(tx, {
      templateId,
      contentHtml,
      publishedById: context.actorUserId,
      approvalDecisionId: context.decisionId,
    });
  }

  /**
   * The publication note, written after the transaction commits so a
   * best-effort audit write can never roll a completed publish back. The
   * version number is re-read rather than carried out of the transaction: one
   * indexed query on a rare path, against a value that would otherwise have
   * to be threaded through a seam that has no other use for it.
   */
  async announceIssued(context: DocumentIssueContext): Promise<void> {
    const templateId = context.document.subjectTemplateId;
    if (templateId === null) {
      return;
    }
    const template = await this.documentTemplateRepository.findById(templateId);
    await this.auditService.record({
      action: 'UPDATE',
      resource: TEMPLATE_AUDIT_RESOURCE,
      resourceId: templateId,
      actorUserId: context.actorUserId,
      metadata: {
        event: 'TEMPLATE_PUBLISHED',
        versionNumber: template?.latestPublishedVersion?.versionNumber ?? null,
        // Null when the clinic publishes directly, which is the default
        // posture; set when an approval released the version (NFR-AUD-03).
        approvalDecisionId: context.decisionId,
        managedDocumentId: context.document.id,
      },
    });
  }
}
