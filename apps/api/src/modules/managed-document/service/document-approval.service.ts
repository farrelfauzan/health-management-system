import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  BulkApproveDocumentsInput,
  DOCUMENT_APPROVAL_ALREADY_DECIDED_ERROR_CODE,
  DOCUMENT_APPROVAL_NOT_AN_APPROVER_ERROR_CODE,
  DOCUMENT_APPROVAL_REQUIRED_ERROR_CODE,
  DOCUMENT_APPROVER_INELIGIBLE_ERROR_CODE,
  DOCUMENT_NOT_SUBMITTABLE_ERROR_CODE,
  DOCUMENT_SELF_APPROVAL_FORBIDDEN_ERROR_CODE,
  DocumentApprovalFrozenPayload,
  DocumentApprovalPendingCountView,
  DocumentApprovalQueueView,
  DocumentApprovalRequestRecord,
  DocumentBulkApprovalItemView,
  DocumentBulkApprovalView,
  ListDocumentApprovalsQueryInput,
  ManagedDocumentDetailView,
  ManagedDocumentRecord,
  RejectDocumentApprovalInput,
  SubmitDocumentForApprovalInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { DocumentApprovalRepository } from '../repository/document-approval.repository';
import { ManagedDocumentRepository } from '../repository/managed-document.repository';
import { DocumentApprovalNotificationService } from './document-approval-notification.service';
import { DocumentIssueBehaviorService } from './document-issue-behavior.service';
import { DocumentTypeService } from './document-type.service';
import { ManagedDocumentAccessService } from './managed-document-access.service';
import {
  toDocumentApprovalRoundView,
  toManagedDocumentApprovalSummaryView,
} from './to-document-approval-view';
import { toManagedDocumentDetailView } from './to-managed-document-view';

const MANAGED_DOCUMENT_AUDIT_RESOURCE = 'managed-document';

/**
 * The approval engine (`P16-T29`, FR-E5-08…18).
 *
 * Five rules here are enforced by this service and never by the UI
 * (NFR-SEC-09) — a client that skipped every dialog would still hit all of
 * them:
 *
 *   * **Approval required means approval happened.** `ISSUED` is reachable
 *     only through an approved round when the type says so (FR-E5-11); a
 *     type that does not require approval lets the drafter issue directly
 *     (FR-E5-12).
 *   * **Being named is not permission, and permission is not being named.**
 *     Deciding needs both (FR-E5-13). The separation is the control (§7.5.9)
 *     and neither half is sufficient on its own.
 *   * **A drafter does not approve their own document** unless the type's
 *     `allowSelfApproval` is on (FR-E5-14) — and a panel that could only
 *     ever self-approve is refused at *submit* time, while the drafter can
 *     still fix it (§7.5.10).
 *   * **The reviewed artefact is frozen.** Editing content or the panel
 *     while a round is open voids it (FR-E5-15); approval releases the
 *     frozen version (FR-E5-16).
 *   * **A deadline decides nothing** (FR-E5-28). `dueAt` is read here only
 *     to be stored; every path that reads it back writes a notification or a
 *     flag, never a decision.
 */
@Injectable()
export class DocumentApprovalService {
  constructor(
    private readonly approvalRepository: DocumentApprovalRepository,
    private readonly managedDocumentRepository: ManagedDocumentRepository,
    private readonly accessService: ManagedDocumentAccessService,
    private readonly documentTypeService: DocumentTypeService,
    private readonly issueBehaviorService: DocumentIssueBehaviorService,
    private readonly notificationService: DocumentApprovalNotificationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Opens a round (FR-E5-09/10). The panel and the content are frozen here;
   * everything after this reads the snapshot, not the row.
   */
  async submitForApproval(
    documentId: string,
    input: SubmitDocumentForApprovalInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentDetailView> {
    const document = await this.findReadableOrThrow(documentId, actor);
    assertSubmittable(document);
    await this.assertNoOpenRound(documentId);
    await this.assertApproversEligible(input.approverIds, document, actor);
    const round = await this.approvalRepository.createRequest({
      documentId,
      frozenPayload: freezeDocument(document, input.approverIds),
      submittedById: actor.sub,
      dueAt: input.dueAt === undefined ? null : new Date(input.dueAt),
      approverIds: input.approverIds,
    });
    await this.managedDocumentRepository.transitionDocument({
      id: documentId,
      status: 'PENDING_APPROVAL',
    });
    await this.recordSubmission(document, round, actor);
    await this.notificationService.announceSubmitted({
      round,
      documentTitle: document.title,
      documentTypeName: document.type.name,
      drafterEmail: document.draftedBy.email,
    });
    return this.buildDetail(documentId, actor);
  }

  /** The drafter changes their mind (FR-E5-18). Nothing is decided; the round just ends. */
  async withdraw(documentId: string, actor: CurrentUser): Promise<ManagedDocumentDetailView> {
    const document = await this.findReadableOrThrow(documentId, actor);
    const round = await this.approvalRepository.findPendingRequestForDocument(documentId);
    if (round === null) {
      throw new ConflictException({
        message: 'This document has no open approval request to withdraw',
        code: DOCUMENT_NOT_SUBMITTABLE_ERROR_CODE,
        errors: { status: document.status },
      });
    }
    await this.approvalRepository.resolveWithoutDecision(round.id, 'WITHDRAWN');
    await this.managedDocumentRepository.transitionDocument({ id: documentId, status: 'DRAFT' });
    await this.record(AuditAction.APPROVAL_WITHDRAWN, document, actor, { roundId: round.id });
    return this.buildDetail(documentId, actor);
  }

  /**
   * The direct issue path (FR-E5-12), and the *only* place a document
   * reaches `ISSUED` without a round. Refused server-side when the type
   * requires approval, whatever the client offered (FR-E5-11).
   */
  async issue(documentId: string, actor: CurrentUser): Promise<ManagedDocumentDetailView> {
    const document = await this.findReadableOrThrow(documentId, actor);
    assertIssuableDirectly(document);
    this.issueBehaviorService.assertBehaviorSupported(document);
    await this.managedDocumentRepository.issueDocument({
      id: documentId,
      issuedAt: new Date(),
      onIssued: async (tx) =>
        this.issueBehaviorService.executeIssue(
          {
            document,
            issuedContent: {
              contentHtml: document.contentHtml,
              storageKey: document.storageKey,
            },
            actorUserId: actor.sub,
            decisionId: null,
          },
          tx,
        ),
    });
    await this.record(AuditAction.DOCUMENT_ISSUED, document, actor, { viaApproval: false });
    await this.issueBehaviorService.announceIssued({
      document,
      issuedContent: { contentHtml: document.contentHtml, storageKey: document.storageKey },
      actorUserId: actor.sub,
      decisionId: null,
    });
    return this.buildDetail(documentId, actor);
  }

  /**
   * Voids every open round on a document because the artefact changed
   * underneath it (FR-E5-15). Called by the registry on a content edit and
   * by anything else that mutates what an approver was looking at.
   *
   * The document goes back to `DRAFT` and the approvers are told — the round
   * ending silently is the failure this exists to prevent.
   */
  async supersedeOpenRounds(document: ManagedDocumentRecord, actor: CurrentUser): Promise<boolean> {
    const round = await this.approvalRepository.findPendingRequestForDocument(document.id);
    if (round === null) {
      return false;
    }
    await this.approvalRepository.supersedePendingForDocument(document.id);
    await this.managedDocumentRepository.transitionDocument({ id: document.id, status: 'DRAFT' });
    await this.record(AuditAction.APPROVAL_SUPERSEDED, document, actor, { roundId: round.id });
    await this.notificationService.announce({
      kind: 'SUPERSEDED',
      documentId: document.id,
      documentTitle: document.title,
      documentTypeName: document.type.name,
      drafterEmail: document.draftedBy.email,
      dueAt: round.dueAt,
      reason: null,
      recipients: round.approvers.map((approver) => ({
        userId: approver.approverId,
        email: approver.email,
      })),
    });
    return true;
  }

  async approve(requestId: string, actor: CurrentUser): Promise<ManagedDocumentDetailView> {
    return this.decide({ requestId, actor, isApproved: true, reason: null });
  }

  async reject(
    requestId: string,
    input: RejectDocumentApprovalInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentDetailView> {
    return this.decide({ requestId, actor, isApproved: false, reason: input.reason });
  }

  /**
   * Approves several rounds in one call (FR-E5-23, R-18).
   *
   * Each item goes through {@link approve} unchanged — the same named-on-panel
   * check, the same self-approval rule, the same row lock, the same issue
   * behaviour. Bulk is a way to spend fewer round trips, never a way to skip
   * a check: onboarding a forty-document corpus should not cost forty visits,
   * and it should not buy a weaker decision either.
   *
   * Sequential rather than parallel, and each failure is reported rather than
   * thrown. One ineligible round fails alone; the rest of the batch stands.
   */
  async bulkApprove(
    input: BulkApproveDocumentsInput,
    actor: CurrentUser,
  ): Promise<DocumentBulkApprovalView> {
    const items: DocumentBulkApprovalItemView[] = [];
    for (const requestId of input.requestIds) {
      items.push(await this.tryApprove(requestId, actor));
    }
    return {
      approvedCount: items.filter((item) => item.isApproved).length,
      failedCount: items.filter((item) => !item.isApproved).length,
      items,
    };
  }

  private async tryApprove(
    requestId: string,
    actor: CurrentUser,
  ): Promise<DocumentBulkApprovalItemView> {
    try {
      await this.approve(requestId, actor);
      return { requestId, isApproved: true, error: null };
    } catch (err: unknown) {
      return { requestId, isApproved: false, error: toBulkApprovalError(err) };
    }
  }

  /** The caller's queue (US-E5-02), or the whole one when they ask for it. */
  async listQueue(
    query: ListDocumentApprovalsQueryInput,
    actor: CurrentUser,
  ): Promise<DocumentApprovalQueueView> {
    const now = new Date();
    const page = await this.approvalRepository.listQueue({
      ...(query.assignedToMe ? { approverId: actor.sub } : {}),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.overdueOnly === undefined ? {} : { overdueOnly: query.overdueOnly }),
      now,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: page.items.map((item) => ({
        round: toDocumentApprovalRoundView(
          item.round,
          item.document.type.requiredApprovals,
          now,
        ),
        document: {
          id: item.document.id,
          title: item.document.title,
          documentNumber: item.document.documentNumber,
          type: {
            id: item.document.type.id,
            code: item.document.type.code,
            name: item.document.type.name,
            behavior: item.document.type.behavior,
            contentMode: item.document.type.contentMode,
          },
        },
      })),
      meta: { page: query.page, limit: query.limit, total: page.total },
    };
  }

  /** The sidebar badge (FR-E5-27): what is waiting on me, and how much of it is late. */
  async getPendingCount(actor: CurrentUser): Promise<DocumentApprovalPendingCountView> {
    return this.approvalRepository.countPendingForApprover(actor.sub, new Date());
  }

  /** The open round on a document, for the registry detail and list. */
  async findOpenRound(documentId: string): Promise<DocumentApprovalRequestRecord | null> {
    return this.approvalRepository.findPendingRequestForDocument(documentId);
  }

  async findOpenRounds(
    documentIds: readonly string[],
  ): Promise<Map<string, DocumentApprovalRequestRecord>> {
    return this.approvalRepository.findPendingRequestsForDocuments(documentIds);
  }

  /** Every round a document has been through, for the history thread (FR-E5-05). */
  async listRounds(documentId: string): Promise<DocumentApprovalRequestRecord[]> {
    return this.approvalRepository.listRequestsForDocument(documentId);
  }

  /** The registry's `approver` filter, resolved to document ids. */
  async findDocumentIdsAwaitingApprover(approverId: string): Promise<string[]> {
    return this.approvalRepository.findDocumentIdsAwaitingApprover(approverId);
  }

  /**
   * One decision (FR-E5-13/14/16/17).
   *
   * Every eligibility check runs *before* the lock, and the lock settles the
   * race: two approvers deciding at once produce one decision and one
   * "already decided" (§7.5.10).
   */
  private async decide(params: {
    requestId: string;
    actor: CurrentUser;
    isApproved: boolean;
    reason: string | null;
  }): Promise<ManagedDocumentDetailView> {
    const round = await this.findOpenRoundOrThrow(params.requestId);
    const document = await this.findReadableOrThrow(round.documentId, params.actor);
    assertNamedOnPanel(round, params.actor.sub);
    assertNotSelfApproval(document, params.actor.sub);
    this.issueBehaviorService.assertBehaviorSupported(document);
    const issuedContent = toIssueContent(round.frozenPayload, document);
    const claimed = await this.approvalRepository.claimDecision({
      requestId: round.id,
      approverId: params.actor.sub,
      isApproved: params.isApproved,
      reason: params.reason,
      requiredApprovals: document.type.requiredApprovals,
      frozenContent: { documentId: document.id, ...issuedContent },
      // FR-E5-16: the type's issue behaviour rides the decision's own
      // transaction, so a template version — or a corpus release — is
      // published by the approval, never alongside it.
      onIssued: async (tx, decisionId) =>
        this.issueBehaviorService.executeIssue(
          {
            document,
            issuedContent: {
              contentHtml: issuedContent.contentHtml,
              storageKey: issuedContent.storageKey,
            },
            actorUserId: params.actor.sub,
            decisionId,
          },
          tx,
        ),
    });
    if (claimed === null) {
      throw new ConflictException({
        message: 'This approval request has already been decided',
        code: DOCUMENT_APPROVAL_ALREADY_DECIDED_ERROR_CODE,
      });
    }
    await this.recordDecision({ round, document, ...params, isResolved: claimed.isResolved });
    if (params.isApproved && claimed.isResolved) {
      await this.issueBehaviorService.announceIssued({
        document,
        issuedContent: {
          contentHtml: issuedContent.contentHtml,
          storageKey: issuedContent.storageKey,
        },
        actorUserId: params.actor.sub,
        decisionId: claimed.decisionId,
      });
    }
    await this.announceDecision({ round, document, ...params, isResolved: claimed.isResolved });
    return this.buildDetail(document.id, params.actor);
  }

  private async announceDecision(params: {
    round: DocumentApprovalRequestRecord;
    document: ManagedDocumentRecord;
    isApproved: boolean;
    isResolved: boolean;
    reason: string | null;
  }): Promise<void> {
    if (!params.isResolved) {
      return;
    }
    await this.notificationService.announce({
      kind: params.isApproved ? 'APPROVED' : 'REJECTED',
      documentId: params.document.id,
      documentTitle: params.document.title,
      documentTypeName: params.document.type.name,
      drafterEmail: params.document.draftedBy.email,
      dueAt: params.round.dueAt,
      reason: params.reason,
      recipients: [
        { userId: params.round.submittedBy.id, email: params.round.submittedBy.email },
      ],
    });
  }

  private async recordSubmission(
    document: ManagedDocumentRecord,
    round: DocumentApprovalRequestRecord,
    actor: CurrentUser,
  ): Promise<void> {
    await this.record(AuditAction.APPROVAL_SUBMITTED, document, actor, {
      roundId: round.id,
      dueAt: round.dueAt?.toISOString() ?? null,
    });
    await this.record(AuditAction.APPROVERS_ASSIGNED, document, actor, {
      roundId: round.id,
      approverIds: round.approvers.map((approver) => approver.approverId),
    });
  }

  private async recordDecision(params: {
    round: DocumentApprovalRequestRecord;
    document: ManagedDocumentRecord;
    actor: CurrentUser;
    isApproved: boolean;
    isResolved: boolean;
    reason: string | null;
  }): Promise<void> {
    await this.record(
      params.isApproved ? AuditAction.APPROVAL_GRANTED : AuditAction.APPROVAL_REJECTED,
      params.document,
      params.actor,
      {
        roundId: params.round.id,
        isResolved: params.isResolved,
        // The reason is the point of a rejection row (US-E5-03); an approval
        // has none, and an empty key would read as one withheld.
        ...(params.reason === null ? {} : { reason: params.reason }),
      },
    );
    if (params.isApproved && params.isResolved) {
      await this.record(AuditAction.DOCUMENT_ISSUED, params.document, params.actor, {
        viaApproval: true,
        roundId: params.round.id,
      });
    }
  }

  /** Every approval row carries its document's type (NFR-AUD-03). */
  private async record(
    action: AuditAction,
    document: ManagedDocumentRecord,
    actor: CurrentUser,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: MANAGED_DOCUMENT_AUDIT_RESOURCE,
      resourceId: document.id,
      actorUserId: actor.sub,
      patientId: document.patient?.id ?? null,
      metadata: { typeCode: document.type.code, ...metadata },
    });
  }

  private async buildDetail(
    documentId: string,
    actor: CurrentUser,
  ): Promise<ManagedDocumentDetailView> {
    const record = await this.findReadableOrThrow(documentId, actor);
    const round = await this.approvalRepository.findPendingRequestForDocument(documentId);
    const type = await this.documentTypeService.findTypeOrThrow(record.typeId);
    return toManagedDocumentDetailView(
      record,
      round === null
        ? null
        : toManagedDocumentApprovalSummaryView(round, record.type.requiredApprovals, new Date()),
      { defaultApprovers: type.defaultApprovers },
    );
  }

  private async findOpenRoundOrThrow(requestId: string): Promise<DocumentApprovalRequestRecord> {
    const round = await this.approvalRepository.findRequestById(requestId);
    if (round === null) {
      throw new NotFoundException('Approval request not found');
    }
    if (round.status !== 'PENDING') {
      throw new ConflictException({
        message: 'This approval request has already been decided',
        code: DOCUMENT_APPROVAL_ALREADY_DECIDED_ERROR_CODE,
        errors: { status: round.status },
      });
    }
    return round;
  }

  private async findReadableOrThrow(
    documentId: string,
    actor: CurrentUser,
  ): Promise<ManagedDocumentRecord> {
    const access = await this.accessService.resolveContext(actor);
    const record = await this.managedDocumentRepository.findVisibleById(documentId, access);
    if (record === null) {
      throw new NotFoundException('Document not found');
    }
    return record;
  }

  private async assertNoOpenRound(documentId: string): Promise<void> {
    const existing = await this.approvalRepository.findPendingRequestForDocument(documentId);
    if (existing !== null) {
      throw new ConflictException({
        message: 'This document already has an open approval request',
        code: DOCUMENT_NOT_SUBMITTABLE_ERROR_CODE,
      });
    }
  }

  /**
   * FR-E5-09 and FR-E5-14 at submit time. A patient may never be named at
   * all; a panel that is only the drafter is refused here rather than at
   * approve time, because a drafter who learns at the last moment that
   * nobody can sign has already waited for nothing (§7.5.10).
   */
  private async assertApproversEligible(
    approverIds: readonly string[],
    document: ManagedDocumentRecord,
    actor: CurrentUser,
  ): Promise<void> {
    const candidates = await this.approvalRepository.findApproverCandidates(approverIds);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const rejected = approverIds.filter((id) => byId.get(id) === undefined || byId.get(id)!.isPatient);
    if (rejected.length > 0) {
      throw new UnprocessableEntityException({
        message: 'An approver must be a live staff account',
        code: DOCUMENT_APPROVER_INELIGIBLE_ERROR_CODE,
        errors: { approverIds: rejected },
      });
    }
    if (
      !document.type.allowSelfApproval &&
      approverIds.length === 1 &&
      approverIds[0] === actor.sub
    ) {
      throw new UnprocessableEntityException({
        message:
          'You cannot be the only approver of your own document — name someone else, or turn on self-approval for this type',
        code: DOCUMENT_SELF_APPROVAL_FORBIDDEN_ERROR_CODE,
      });
    }
  }
}

/** FR-E5-10: only a draft is submitted, and a generated bill never is. */
function assertSubmittable(document: ManagedDocumentRecord): void {
  if (document.type.behavior === 'PATIENT_BILL' || document.status !== 'DRAFT') {
    throw new ConflictException({
      message:
        document.type.behavior === 'PATIENT_BILL'
          ? 'A generated patient bill is never submitted for approval'
          : 'Only a draft can be submitted for approval',
      code: DOCUMENT_NOT_SUBMITTABLE_ERROR_CODE,
      errors: { status: document.status },
    });
  }
}

/**
 * FR-E5-11/12. The service refuses the direct issue when the type requires
 * approval — this is the check that has to hold when a client skips every
 * dialog the workspace draws (NFR-SEC-09).
 */
function assertIssuableDirectly(document: ManagedDocumentRecord): void {
  if (document.type.isApprovalRequired) {
    throw new ConflictException({
      message: 'This document type requires approval before a document can be issued',
      code: DOCUMENT_APPROVAL_REQUIRED_ERROR_CODE,
    });
  }
  if (document.status !== 'DRAFT') {
    throw new ConflictException({
      message: 'Only a draft can be issued',
      code: DOCUMENT_NOT_SUBMITTABLE_ERROR_CODE,
      errors: { status: document.status },
    });
  }
}

/** FR-E5-13: holding `decide` is not enough — the round has to have named you. */
function assertNamedOnPanel(round: DocumentApprovalRequestRecord, userId: string): void {
  if (!round.approvers.some((approver) => approver.approverId === userId)) {
    throw new ForbiddenException({
      message: 'You were not named as an approver on this request',
      code: DOCUMENT_APPROVAL_NOT_AN_APPROVER_ERROR_CODE,
    });
  }
}

/** FR-E5-14: the drafter does not sign off their own work unless the type allows it. */
function assertNotSelfApproval(document: ManagedDocumentRecord, userId: string): void {
  if (document.draftedBy.id === userId && !document.type.allowSelfApproval) {
    throw new ForbiddenException({
      message: 'A drafter cannot approve their own document for this type',
      code: DOCUMENT_SELF_APPROVAL_FORBIDDEN_ERROR_CODE,
    });
  }
}

/** The snapshot a submission takes (FR-E5-16). */
function freezeDocument(
  document: ManagedDocumentRecord,
  approverIds: readonly string[],
): DocumentApprovalFrozenPayload {
  return {
    title: document.title,
    documentNumber: document.documentNumber,
    contentHtml: document.contentHtml,
    storageKey: document.storageKey,
    storageMimeType: document.storageMimeType,
    storageSizeBytes: document.storageSizeBytes,
    patientId: document.patient?.id ?? null,
    doctorId: document.doctor?.id ?? null,
    approverIds: [...approverIds],
    frozenAt: new Date().toISOString(),
  };
}

/**
 * The frozen content, restored onto the row at issue.
 *
 * Falls back to the live record field by field, because a payload written by
 * an older build may be missing one — and a missing key must leave the
 * column as it is rather than blanking a document's body.
 */
function toIssueContent(
  payload: DocumentApprovalFrozenPayload,
  document: ManagedDocumentRecord,
): {
  title: string;
  documentNumber: string | null;
  contentHtml: string | null;
  storageKey: string | null;
  storageMimeType: string | null;
  storageSizeBytes: number | null;
} {
  return {
    title: payload.title ?? document.title,
    documentNumber: payload.documentNumber ?? document.documentNumber,
    contentHtml: payload.contentHtml ?? document.contentHtml,
    storageKey: payload.storageKey ?? document.storageKey,
    storageMimeType: payload.storageMimeType ?? document.storageMimeType,
    storageSizeBytes: payload.storageSizeBytes ?? document.storageSizeBytes,
  };
}


/**
 * The refusal, flattened for one line of a batch result.
 *
 * Only `HttpException`s are unwrapped — those are the deliberate refusals
 * this service raises, and their bodies are already written for a person to
 * read. Anything else is a bug rather than a decision, and it reports as one
 * generic line rather than leaking an internal message into a list an
 * approver is scanning.
 */
function toBulkApprovalError(err: unknown): { code: string; message: string } {
  if (!(err instanceof HttpException)) {
    return { code: 'DOCUMENT_APPROVAL_FAILED', message: 'This approval could not be recorded' };
  }
  const response = err.getResponse();
  if (typeof response === 'object' && response !== null) {
    const body = response as { code?: unknown; message?: unknown };
    return {
      code: typeof body.code === 'string' ? body.code : 'DOCUMENT_APPROVAL_FAILED',
      message: typeof body.message === 'string' ? body.message : err.message,
    };
  }
  return { code: 'DOCUMENT_APPROVAL_FAILED', message: err.message };
}
