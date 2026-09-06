import { ConflictException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';

import {
  DocumentTemplateApprovalPreviewView,
  DocumentTemplateApprovalView,
  DocumentTemplateRecord,
  ManagedDocumentRecord,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentApprovalService } from '../../managed-document/service/document-approval.service';
import { DocumentTypeService } from '../../managed-document/service/document-type.service';
import { ManagedDocumentService } from '../../managed-document/service/managed-document.service';
import { toManagedDocumentApprovalSummaryView } from '../../managed-document/service/to-document-approval-view';
import { DocumentTemplateRepository } from '../repository/document-template.repository';
import { buildTemplateHtmlDiff } from './build-template-html-diff';
import { DocumentTemplatePreviewService } from './document-template-preview.service';

/**
 * The system type whose `behavior` binds a registry row to a template.
 * Resolved by code, never by name: the seed owns the code, the clinic owns
 * the name (FR-E5-33).
 */
export const INVOICE_TEMPLATE_TYPE_CODE = 'INVOICE_TEMPLATE';

export const DOCUMENT_TEMPLATE_APPROVAL_REQUIRED_ERROR_CODE =
  'DOCUMENT_TEMPLATE_APPROVAL_REQUIRED';

/** The all-off answer: what every caller sees until a clinic switches the policy on. */
const NO_APPROVAL: DocumentTemplateApprovalView = {
  isApprovalRequired: false,
  managedDocumentId: null,
  status: null,
  pendingRound: null,
};

/**
 * The approval half of the template editor (`P16-T32`, FR-E5-16/21/22).
 *
 * Its own service rather than a section of {@link DocumentTemplateService},
 * because it is the only part of templates that knows the registry exists —
 * and because the rule it enforces has to survive the editor being bypassed
 * entirely (NFR-SEC-09): publishing is refused in the service, so a client
 * that skipped the dialog and posted straight to `/publish` gets the same
 * 409 the button would have prevented.
 *
 * **All of this is inert by default.** `INVOICE_TEMPLATE` ships with
 * `is_approval_required = FALSE`, so {@link resolveApprovalView} answers
 * "no" without a registry row ever existing, and publishing behaves exactly
 * as E1 specifies (US-E5-06). A clinic switching the policy on is what makes
 * any of it appear.
 */
@Injectable()
export class DocumentTemplateApprovalService {
  constructor(
    @Inject(forwardRef(() => DocumentTypeService))
    private readonly documentTypeService: DocumentTypeService,
    @Inject(forwardRef(() => ManagedDocumentService))
    private readonly managedDocumentService: ManagedDocumentService,
    @Inject(forwardRef(() => DocumentApprovalService))
    private readonly approvalService: DocumentApprovalService,
    private readonly documentTemplateRepository: DocumentTemplateRepository,
    private readonly previewService: DocumentTemplatePreviewService,
  ) {}

  /**
   * What an approver reads before deciding (FR-E5-21/22): the frozen
   * submission rendered against the hostile fixture, and a diff of it
   * against the version invoices render from today.
   *
   * Both halves read the round's frozen payload rather than the template
   * row. An approver must be looking at the thing they are approving, and
   * the drafter is free to keep editing the working copy while they do.
   */
  async previewOpenSubmission(
    templateId: string,
    actor: CurrentUser,
  ): Promise<DocumentTemplateApprovalPreviewView> {
    const template = await this.documentTemplateRepository.findById(templateId);
    if (template === null) {
      throw new NotFoundException('Document template not found');
    }
    const governed = await this.managedDocumentService.findGovernedDocument({
      kind: 'TEMPLATE',
      id: templateId,
    });
    const round = governed === null ? null : await this.approvalService.findOpenRound(governed.id);
    if (round === null) {
      throw new NotFoundException('This template has no open approval request');
    }
    const submittedHtml = round.frozenPayload.contentHtml ?? '';
    return {
      preview: await this.previewService.previewSubmittedHtml({
        templateId,
        contentHtml: submittedHtml,
        actor,
      }),
      baseVersionNumber: template.latestPublishedVersion?.versionNumber ?? null,
      diff: buildTemplateHtmlDiff(
        template.latestPublishedVersion?.contentHtml ?? '',
        submittedHtml,
      ),
    };
  }

  /**
   * Refuses a direct publish while the policy is on (§7.5.8).
   *
   * The message names the registry row so the editor can route the drafter
   * to submit-for-approval rather than leaving them with a dead button, and
   * so a script that hit this can find the same door.
   */
  async assertPublishAllowed(template: DocumentTemplateRecord): Promise<void> {
    if (!(await this.isApprovalRequired())) {
      return;
    }
    const governed = await this.managedDocumentService.findGovernedDocument({
      kind: 'TEMPLATE',
      id: template.id,
    });
    throw new ConflictException({
      message:
        'Publishing this template needs approval — submit it for approval instead of publishing directly',
      code: DOCUMENT_TEMPLATE_APPROVAL_REQUIRED_ERROR_CODE,
      errors: { managedDocumentId: governed?.id ?? null },
    });
  }

  /**
   * Mirrors the working copy onto its registry row, so a submission has
   * something to freeze and an approver reviews the layout as it stands.
   *
   * Only while the policy is on. A clinic that never turns approval on never
   * accumulates registry rows for its templates — the feature leaves no
   * trace when it is off, which is what makes turning it off a real rollback
   * rather than a hidden mode.
   */
  async syncRegistryRow(
    template: DocumentTemplateRecord,
    actor: CurrentUser,
  ): Promise<ManagedDocumentRecord | null> {
    if (!(await this.isApprovalRequired())) {
      return null;
    }
    return this.managedDocumentService.syncGovernedDocument(
      {
        typeCode: INVOICE_TEMPLATE_TYPE_CODE,
        subject: { kind: 'TEMPLATE', id: template.id },
        title: template.name,
        contentHtml: template.contentHtml,
      },
      actor,
    );
  }

  /** The approval block every template view carries. */
  async resolveApprovalView(templateId: string): Promise<DocumentTemplateApprovalView> {
    if (!(await this.isApprovalRequired())) {
      return NO_APPROVAL;
    }
    const governed = await this.managedDocumentService.findGovernedDocument({
      kind: 'TEMPLATE',
      id: templateId,
    });
    if (governed === null) {
      return { ...NO_APPROVAL, isApprovalRequired: true };
    }
    const round = await this.approvalService.findOpenRound(governed.id);
    return {
      isApprovalRequired: true,
      managedDocumentId: governed.id,
      status: governed.status,
      pendingRound:
        round === null
          ? null
          : toManagedDocumentApprovalSummaryView(
              round,
              governed.type.requiredApprovals,
              new Date(),
            ),
    };
  }

  /**
   * The policy, read fresh on every call.
   *
   * Deliberately not cached: a clinic turning approval off is how R-15's
   * bottleneck is escaped, and a cached "on" would keep the gate closed
   * after somebody had already opened it. A missing type row reads as off,
   * because master data that has not been seeded must not take invoicing
   * down.
   */
  private async isApprovalRequired(): Promise<boolean> {
    const type = await this.documentTypeService.findTypeByCode(INVOICE_TEMPLATE_TYPE_CODE);
    return type?.isApprovalRequired ?? false;
  }
}
