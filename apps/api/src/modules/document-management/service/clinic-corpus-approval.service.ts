import { ConflictException, Inject, Injectable, forwardRef } from '@nestjs/common';

import {
  ClinicDocumentApprovalView,
  DocumentIngestStatusValue,
  DocumentRecord,
  ManagedDocumentRecord,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentApprovalService } from '../../managed-document/service/document-approval.service';
import { DocumentTypeService } from '../../managed-document/service/document-type.service';
import { ManagedDocumentService } from '../../managed-document/service/managed-document.service';
import { toManagedDocumentApprovalSummaryView } from '../../managed-document/service/to-document-approval-view';

/**
 * The system type whose `behavior` binds a registry row to a corpus
 * document. Resolved by code, never by name (FR-E5-33).
 */
export const CLINIC_CORPUS_TYPE_CODE = 'CLINIC_CORPUS_DOCUMENT';

export const CLINIC_CORPUS_APPROVAL_REQUIRED_ERROR_CODE = 'CLINIC_CORPUS_APPROVAL_REQUIRED';

/** The all-off answer, and what every ungoverned document reports. */
const NO_APPROVAL: ClinicDocumentApprovalView = {
  isApprovalRequired: false,
  managedDocumentId: null,
  status: null,
  pendingRound: null,
};

/**
 * The approval gate over the clinic corpus (`P16-T33`, FR-E5-19/20).
 *
 * Two invariants, and neither is negotiable:
 *
 *   * **A corpus document is not ingested until it is approved.** Under an
 *     active policy a confirmed upload stays `NOT_APPLICABLE`; approval —
 *     and only approval — moves it to `PENDING`, where the worker can see
 *     it. Nothing here ingests anything; it decides when the existing
 *     pipeline is allowed to start (§7.5.3).
 *   * **Exclusion is a candidate-set fact, not a ranking one** (NFR-SEC-10).
 *     That half lives in `DocumentRetrievalRepository`, whose predicate
 *     drops any corpus document with a registry row that is not `ISSUED`.
 *     This service's job is to make sure the registry row exists and says
 *     the truth.
 *
 * **Enabling the policy is not retroactive** (OQ-18). Turning it on writes
 * no registry rows and changes no answer the assistant already gives; a
 * document that was ingested before the switch stays ingested. Only
 * {@link sendForReview} — an explicit, audited admin action — puts an
 * existing document behind the gate, and it takes it out of the corpus while
 * it waits, which is the point of asking for a review (R-19).
 */
@Injectable()
export class ClinicCorpusApprovalService {
  constructor(
    @Inject(forwardRef(() => DocumentTypeService))
    private readonly documentTypeService: DocumentTypeService,
    @Inject(forwardRef(() => ManagedDocumentService))
    private readonly managedDocumentService: ManagedDocumentService,
    @Inject(forwardRef(() => DocumentApprovalService))
    private readonly approvalService: DocumentApprovalService,
  ) {}

  /**
   * The ingest status a confirmed upload starts at (FR-E5-19).
   *
   * `proposed` is what the module would have chosen on its own; this returns
   * `NOT_APPLICABLE` in its place only when the policy is on **and** the
   * document was headed for the queue. A `GENERAL` document, or an image, is
   * never ingested for reasons that have nothing to do with approval, and
   * gating it would put a registry row in front of a decision nobody makes.
   */
  async resolveGatedIngestStatus(
    proposed: DocumentIngestStatusValue,
  ): Promise<DocumentIngestStatusValue> {
    if (proposed !== 'PENDING') {
      return proposed;
    }
    return (await this.isApprovalRequired()) ? 'NOT_APPLICABLE' : proposed;
  }

  /**
   * Registers a corpus document with the registry so it can be submitted.
   *
   * Only while the policy is on: a clinic that never turns approval on never
   * accumulates registry rows for its corpus, so switching the entitlement
   * off is a real rollback rather than a hidden mode.
   */
  async syncRegistryRow(
    document: DocumentRecord,
    actor: CurrentUser,
  ): Promise<ManagedDocumentRecord | null> {
    if (!(await this.isApprovalRequired())) {
      return null;
    }
    return this.registerGovernedDocument(document, actor);
  }

  /**
   * The explicit "send this existing document for review" action (R-19).
   *
   * Unconditional on the policy, unlike {@link syncRegistryRow}: an admin
   * asking for a review has already decided, and refusing because the type's
   * switch happens to be off would leave them with no way to act on a
   * document they are worried about. The document leaves the retrieval
   * candidate set from this moment until somebody approves it — that is what
   * a review means, and it is the safe direction.
   */
  async sendForReview(document: DocumentRecord, actor: CurrentUser): Promise<ManagedDocumentRecord> {
    return this.registerGovernedDocument(document, actor);
  }

  /**
   * Refuses a manual re-ingest of a document that is still waiting on a
   * signature (§7.5.8). Service-level, so a client that skipped the disabled
   * button gets the same answer (NFR-SEC-09).
   */
  async assertIngestAllowed(document: DocumentRecord): Promise<void> {
    const governed = await this.findGoverned(document.id);
    if (governed === null || governed.status === 'ISSUED') {
      return;
    }
    throw new ConflictException({
      message:
        'This document is waiting for approval — the assistant cannot retrieve it, and it cannot be ingested until it is approved',
      code: CLINIC_CORPUS_APPROVAL_REQUIRED_ERROR_CODE,
      errors: { managedDocumentId: governed.id, status: governed.status },
    });
  }

  /**
   * Whether a change to `visibility` has to go back through approval
   * (FR-E5-20).
   *
   * `visibility` is the field that decides whether the assistant may quote a
   * document to a patient, so changing it on an issued document is a new
   * decision, not an edit. The document leaves the candidate set the moment
   * the row stops being `ISSUED` and does not return until it is re-approved
   * — including when the re-approval is refused, which is the direction that
   * cannot leak.
   */
  async requiresReapprovalOnVisibilityChange(documentId: string): Promise<boolean> {
    const governed = await this.findGoverned(documentId);
    return governed !== null && governed.status === 'ISSUED';
  }

  /**
   * Returns an issued corpus document to review after its visibility changed.
   *
   * Re-submitted to the panel that approved it last, when that panel can
   * still act. When it cannot — nobody was named, or the only name is the
   * person making the change and the type forbids self-approval — the row is
   * left in `DRAFT` for somebody to submit deliberately. Either state is out
   * of the retrieval candidate set, so the invariant holds whichever way this
   * goes; what changes is only how much typing the admin has left to do.
   */
  async reopenForVisibilityChange(documentId: string, actor: CurrentUser): Promise<void> {
    const governed = await this.findGoverned(documentId);
    if (governed === null || governed.status !== 'ISSUED') {
      return;
    }
    await this.managedDocumentService.returnGovernedDocumentToDraft(governed, actor);
    const approverIds = await this.resolvePreviousPanel(governed, actor);
    if (approverIds.length === 0) {
      return;
    }
    await this.approvalService.submitForApproval(governed.id, { approverIds }, actor);
  }

  /** The approval block a corpus document view carries. */
  async resolveApprovalView(documentId: string): Promise<ClinicDocumentApprovalView> {
    const governed = await this.findGoverned(documentId);
    if (governed === null) {
      return { ...NO_APPROVAL, isApprovalRequired: await this.isApprovalRequired() };
    }
    const round = await this.approvalService.findOpenRound(governed.id);
    return {
      isApprovalRequired: governed.type.isApprovalRequired,
      managedDocumentId: governed.id,
      status: governed.status,
      pendingRound:
        round === null
          ? null
          : toManagedDocumentApprovalSummaryView(round, governed.type.requiredApprovals, new Date()),
    };
  }

  /** The approval blocks for a whole page, in two queries rather than 2N. */
  async resolveApprovalViews(
    documentIds: readonly string[],
  ): Promise<Map<string, ClinicDocumentApprovalView>> {
    const isRequired = await this.isApprovalRequired();
    const governed = await this.managedDocumentService.findGovernedDocuments(documentIds);
    const rounds = await this.approvalService.findOpenRounds(
      [...governed.values()].map((row) => row.id),
    );
    const now = new Date();
    return new Map(
      documentIds.map((documentId) => {
        const row = governed.get(documentId);
        if (row === undefined) {
          return [documentId, { ...NO_APPROVAL, isApprovalRequired: isRequired }];
        }
        const round = rounds.get(row.id);
        return [
          documentId,
          {
            isApprovalRequired: row.type.isApprovalRequired,
            managedDocumentId: row.id,
            status: row.status,
            pendingRound:
              round === undefined
                ? null
                : toManagedDocumentApprovalSummaryView(round, row.type.requiredApprovals, now),
          },
        ];
      }),
    );
  }

  private async registerGovernedDocument(
    document: DocumentRecord,
    actor: CurrentUser,
  ): Promise<ManagedDocumentRecord> {
    return this.managedDocumentService.syncGovernedDocument(
      {
        typeCode: CLINIC_CORPUS_TYPE_CODE,
        subject: { kind: 'STORE_DOCUMENT', id: document.id },
        title: document.title,
        storageKey: document.storageKey,
        storageMimeType: document.mimeType,
        storageSizeBytes: document.sizeBytes,
      },
      actor,
    );
  }

  /**
   * The approvers of the most recent resolved round, minus anyone who could
   * only self-approve. Empty when there is nobody to re-ask — a document
   * issued before the policy existed has no panel to inherit.
   */
  private async resolvePreviousPanel(
    governed: ManagedDocumentRecord,
    actor: CurrentUser,
  ): Promise<string[]> {
    const rounds = await this.approvalService.listRounds(governed.id);
    const lastApproved = rounds.find((round) => round.status === 'APPROVED');
    if (lastApproved === undefined) {
      return [];
    }
    const approverIds = lastApproved.approvers
      .filter((approver) => approver.isEligible)
      .map((approver) => approver.approverId);
    const isSelfApprovalOnly =
      approverIds.length === 1 && approverIds[0] === actor.sub && !governed.type.allowSelfApproval;
    return isSelfApprovalOnly ? [] : approverIds;
  }

  private async findGoverned(documentId: string): Promise<ManagedDocumentRecord | null> {
    return this.managedDocumentService.findGovernedDocument({
      kind: 'STORE_DOCUMENT',
      id: documentId,
    });
  }

  /**
   * The policy, read fresh. Not cached for the same reason the template arm
   * is not: turning the policy off is how a clinic escapes a queue it cannot
   * clear (R-18), and a cached "on" would keep the gate shut after somebody
   * had already opened it.
   */
  private async isApprovalRequired(): Promise<boolean> {
    const type = await this.documentTypeService.findTypeByCode(CLINIC_CORPUS_TYPE_CODE);
    return type?.isApprovalRequired ?? false;
  }
}
