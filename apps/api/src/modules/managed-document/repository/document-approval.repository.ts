import { Injectable } from '@nestjs/common';

import {
  CreateDocumentApprovalRequestPayload,
  DocumentApprovalDeadlineKind,
  DocumentApprovalDeadlineRecord,
  DocumentApprovalFrozenPayload,
  DocumentApprovalPendingCounts,
  DocumentApprovalQueuePage,
  DocumentApprovalRequestRecord,
  DocumentApprovalStatusValue,
  DocumentApproverCandidateRecord,
  ListDocumentApprovalsParams,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const PATIENT_ROLE_CODE = 'PATIENT';

/**
 * The version an approval releases (FR-E5-16): the fields the submission
 * froze, restored onto the row in the approving transaction. An approver
 * approved *this*, so this is what gets issued — not whatever the document
 * happens to say when the last approval lands.
 */
export type DocumentApprovalIssueContent = {
  documentId: string;
  title: string;
  documentNumber: string | null;
  contentHtml: string | null;
  storageKey: string | null;
  storageMimeType: string | null;
  storageSizeBytes: number | null;
};

/**
 * The key that makes a named approver an *effective* one (FR-E5-13). Being
 * on the panel and holding this are two separate conditions, and both have
 * to be true at the moment of the decision — not at the moment of naming.
 */
export const DOCUMENT_APPROVAL_DECIDE_PERMISSION_KEY = 'document-approval.decide:any';

const REQUEST_INCLUDE = {
  submittedBy: { select: { id: true, email: true } },
  approvers: {
    orderBy: { approver: { email: 'asc' as const } },
    select: { approverId: true, approver: { select: { id: true, email: true } } },
  },
  decisions: {
    orderBy: { decidedAt: 'asc' as const },
    select: {
      id: true,
      approverId: true,
      isApproved: true,
      reason: true,
      decidedAt: true,
      approver: { select: { email: true } },
    },
  },
} satisfies Prisma.DocumentApprovalRequestInclude;

type RequestRow = Prisma.DocumentApprovalRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

/**
 * Persistence for approval rounds (`P16-T29`).
 *
 * Two things here are not ordinary CRUD and are the reason this repository
 * exists apart from {@link ManagedDocumentRepository}:
 *
 *   * {@link claimDecision} takes a **row lock** on the round before it
 *     writes. Two approvers pressing Approve at the same instant is the
 *     normal case, not the pathological one, and without the lock both would
 *     read `PENDING`, both would issue, and the document would be released
 *     twice (§7.5.10). The first decision wins; the second is told the round
 *     is already decided.
 *   * {@link claimDeadlineNotice} is a conditional update rather than a
 *     read-then-write, so a second sweep tick — or a second process — sends
 *     nothing. The claim is what makes the scheduler idempotent (FR-E5-27).
 *
 * Eligibility is resolved by joining live roles rather than stored on the
 * approver row: a person who loses the decide key between submission and
 * decision must stop counting immediately, and a denormalised copy would
 * mean they kept counting until something refreshed it.
 */
@Injectable()
export class DocumentApprovalRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Opens a round and names its panel in one transaction. The partial unique
   * index on `(document_id) WHERE status = 'PENDING'` is what actually stops
   * a double submit; this write simply fails against it, and the service
   * turns that into "already submitted" rather than a 500.
   */
  async createRequest(
    payload: CreateDocumentApprovalRequestPayload,
  ): Promise<DocumentApprovalRequestRecord> {
    const row = await this.prismaService.documentApprovalRequest.create({
      data: {
        documentId: payload.documentId,
        frozenPayload: payload.frozenPayload as unknown as Prisma.InputJsonValue,
        submittedById: payload.submittedById,
        dueAt: payload.dueAt,
        approvers: {
          create: payload.approverIds.map((approverId) => ({ approverId })),
        },
      },
      include: REQUEST_INCLUDE,
    });
    return this.toRecord(row, await this.findEligibleApproverIds(row));
  }

  async findRequestById(id: string): Promise<DocumentApprovalRequestRecord | null> {
    const row = await this.prismaService.documentApprovalRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    return row === null ? null : this.toRecord(row, await this.findEligibleApproverIds(row));
  }

  /** The open round on a document, or null. At most one exists by index. */
  async findPendingRequestForDocument(
    documentId: string,
  ): Promise<DocumentApprovalRequestRecord | null> {
    const row = await this.prismaService.documentApprovalRequest.findFirst({
      where: { documentId, status: 'PENDING' },
      include: REQUEST_INCLUDE,
    });
    return row === null ? null : this.toRecord(row, await this.findEligibleApproverIds(row));
  }

  /** Every round a document has been through, newest first (FR-E5-05). */
  async listRequestsForDocument(documentId: string): Promise<DocumentApprovalRequestRecord[]> {
    const rows = await this.prismaService.documentApprovalRequest.findMany({
      where: { documentId },
      include: REQUEST_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    });
    const eligibleIds = await this.findEligibleApproverIdsForRows(rows);
    return rows.map((row) => this.toRecord(row, eligibleIds));
  }

  /**
   * The open rounds on many documents at once, keyed by document id — the
   * registry list's one extra query rather than one per row.
   */
  async findPendingRequestsForDocuments(
    documentIds: readonly string[],
  ): Promise<Map<string, DocumentApprovalRequestRecord>> {
    if (documentIds.length === 0) {
      return new Map();
    }
    const rows = await this.prismaService.documentApprovalRequest.findMany({
      where: { documentId: { in: [...documentIds] }, status: 'PENDING' },
      include: REQUEST_INCLUDE,
    });
    const eligibleIds = await this.findEligibleApproverIdsForRows(rows);
    return new Map(rows.map((row) => [row.documentId, this.toRecord(row, eligibleIds)]));
  }

  /** Document ids with an open round naming this approver — the registry's `approver` filter. */
  async findDocumentIdsAwaitingApprover(approverId: string): Promise<string[]> {
    const rows = await this.prismaService.documentApprovalRequest.findMany({
      where: { status: 'PENDING', approvers: { some: { approverId } } },
      select: { documentId: true },
    });
    return rows.map((row) => row.documentId);
  }

  async listQueue(params: ListDocumentApprovalsParams): Promise<DocumentApprovalQueuePage> {
    const where = buildQueueWhere(params);
    const [rows, total] = await this.prismaService.executeTransaction(async (tx) => {
      const pageRows = await tx.documentApprovalRequest.findMany({
        where,
        include: {
          ...REQUEST_INCLUDE,
          document: {
            select: {
              id: true,
              title: true,
              documentNumber: true,
              type: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  behavior: true,
                  contentMode: true,
                  requiredApprovals: true,
                },
              },
            },
          },
        },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { submittedAt: 'asc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      });
      return [pageRows, await tx.documentApprovalRequest.count({ where })];
    });
    const eligibleIds = await this.findEligibleApproverIdsForRows(rows);
    return {
      items: rows.map((row) => ({
        round: this.toRecord(row, eligibleIds),
        document: row.document,
      })),
      total,
    };
  }

  /**
   * The badge (FR-E5-27). Two counts in one round trip; `overdue` is a
   * subset of `pending`, so a caller never has to add them.
   */
  async countPendingForApprover(
    approverId: string,
    now: Date,
  ): Promise<DocumentApprovalPendingCounts> {
    const assigned = { status: 'PENDING' as const, approvers: { some: { approverId } } };
    const [pending, overdue] = await this.prismaService.executeTransaction(async (tx) => [
      await tx.documentApprovalRequest.count({ where: assigned }),
      await tx.documentApprovalRequest.count({ where: { ...assigned, dueAt: { lt: now } } }),
    ]);
    return { pending, overdue };
  }

  /**
   * Records one decision under a row lock and, when that decision resolves
   * the round, releases the frozen version in the same transaction
   * (FR-E5-16).
   *
   * `SELECT ... FOR UPDATE` on the request is the whole point. Two approvers
   * pressing Approve at the same instant is the normal case, and without the
   * lock both would read `PENDING`, both would count themselves the last
   * approval, and the document would be issued twice. With it the first
   * decision wins and the second is told the round is already decided
   * (§7.5.10).
   *
   * Returning `null` rather than throwing keeps "somebody got there first"
   * an ordinary outcome the service turns into a 409, not an exception path.
   */
  async claimDecision(params: {
    requestId: string;
    approverId: string;
    isApproved: boolean;
    reason: string | null;
    requiredApprovals: number;
    /**
     * The content to release when this decision resolves the round —
     * the payload frozen at submission, never a re-read of the live row.
     */
    frozenContent: DocumentApprovalIssueContent;
  }): Promise<{ isResolved: boolean; approvalCount: number } | null> {
    return this.prismaService.executeTransaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status"::text AS "status"
        FROM "document_approval_requests"
        WHERE "id" = ${params.requestId}::uuid
        FOR UPDATE
      `;
      const lockedRow = locked.at(0);
      if (lockedRow === undefined || lockedRow.status !== 'PENDING') {
        return null;
      }
      await tx.documentApprovalDecision.create({
        data: {
          requestId: params.requestId,
          approverId: params.approverId,
          isApproved: params.isApproved,
          reason: params.reason,
        },
      });
      if (!params.isApproved) {
        await tx.documentApprovalRequest.update({
          where: { id: params.requestId },
          data: { status: 'REJECTED', resolvedAt: new Date() },
        });
        // FR-E5-17: a rejected document goes back to the drafter, not into
        // limbo. Same transaction as the decision, so a document can never be
        // left PENDING_APPROVAL under a round that has already been rejected.
        await tx.managedDocument.update({
          where: { id: params.frozenContent.documentId },
          data: { status: 'DRAFT' },
        });
        return { isResolved: true, approvalCount: 0 };
      }
      const approvalCount = await tx.documentApprovalDecision.count({
        where: { requestId: params.requestId, isApproved: true },
      });
      const isResolved = approvalCount >= params.requiredApprovals;
      if (isResolved) {
        await tx.documentApprovalRequest.update({
          where: { id: params.requestId },
          data: { status: 'APPROVED', resolvedAt: new Date() },
        });
        await tx.managedDocument.update({
          where: { id: params.frozenContent.documentId },
          data: {
            status: 'ISSUED',
            issuedAt: new Date(),
            title: params.frozenContent.title,
            documentNumber: params.frozenContent.documentNumber,
            contentHtml: params.frozenContent.contentHtml,
            storageKey: params.frozenContent.storageKey,
            storageMimeType: params.frozenContent.storageMimeType,
            storageSizeBytes: params.frozenContent.storageSizeBytes,
          },
        });
      }
      return { isResolved, approvalCount };
    });
  }

  /**
   * Ends an open round without a decision. Conditional on `PENDING`, so a
   * withdraw racing a decision loses rather than overwriting it — `count`
   * of zero means the round had already resolved.
   */
  async resolveWithoutDecision(
    requestId: string,
    status: Extract<DocumentApprovalStatusValue, 'WITHDRAWN' | 'SUPERSEDED'>,
  ): Promise<boolean> {
    const result = await this.prismaService.documentApprovalRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status, resolvedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Every open round on a document, superseded at once (the edit-while-pending path). */
  async supersedePendingForDocument(documentId: string): Promise<number> {
    const result = await this.prismaService.documentApprovalRequest.updateMany({
      where: { documentId, status: 'PENDING' },
      data: { status: 'SUPERSEDED', resolvedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Open rounds whose deadline has crossed a threshold and that have not yet
   * been claimed for that notice. The `WHERE` carries the not-yet-claimed
   * test so a sweep with nothing to do costs one indexed query.
   */
  async listDeadlineCandidates(params: {
    kind: DocumentApprovalDeadlineKind;
    threshold: Date;
    limit: number;
  }): Promise<DocumentApprovalDeadlineRecord[]> {
    const rows = await this.prismaService.documentApprovalRequest.findMany({
      where: {
        status: 'PENDING',
        dueAt: { not: null, lte: params.threshold },
        ...(params.kind === 'DUE_SOON'
          ? { dueSoonNotifiedAt: null }
          : { overdueNotifiedAt: null }),
      },
      select: {
        id: true,
        documentId: true,
        dueAt: true,
        submittedById: true,
        document: { select: { title: true, type: { select: { name: true } } } },
        approvers: { select: { approverId: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: params.limit,
    });
    return rows.flatMap((row) =>
      row.dueAt === null
        ? []
        : [
            {
              requestId: row.id,
              documentId: row.documentId,
              documentTitle: row.document.title,
              documentTypeName: row.document.type.name,
              dueAt: row.dueAt,
              submittedById: row.submittedById,
              approverIds: row.approvers.map((approver) => approver.approverId),
            },
          ],
    );
  }

  /**
   * Claims one deadline notice for one round. Conditional on the stamp still
   * being null, so exactly one caller ever wins and a re-run of the sweep
   * sends nothing (FR-E5-27).
   */
  async claimDeadlineNotice(
    requestId: string,
    kind: DocumentApprovalDeadlineKind,
  ): Promise<boolean> {
    const result = await this.prismaService.documentApprovalRequest.updateMany({
      where: {
        id: requestId,
        status: 'PENDING',
        ...(kind === 'DUE_SOON' ? { dueSoonNotifiedAt: null } : { overdueNotifiedAt: null }),
      },
      data:
        kind === 'DUE_SOON' ? { dueSoonNotifiedAt: new Date() } : { overdueNotifiedAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Who the named ids actually are (FR-E5-09): a live, non-system account,
   * whether any of its roles is PATIENT, and whether any of them carries the
   * decide key. The two flags refuse for different reasons — a patient may
   * never be named at all, a staff account without the key may be named and
   * simply cannot act yet.
   */
  async findApproverCandidates(
    approverIds: readonly string[],
  ): Promise<DocumentApproverCandidateRecord[]> {
    if (approverIds.length === 0) {
      return [];
    }
    const rows = await this.prismaService.user.findMany({
      where: { id: { in: [...approverIds] }, isActive: true, isSystem: false, deletedAt: null },
      select: {
        id: true,
        email: true,
        roles: {
          where: { deletedAt: null, unassignedAt: null },
          select: {
            role: {
              select: {
                code: true,
                permissions: { select: { permission: { select: { permissionKey: true } } } },
              },
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      isPatient: row.roles.some((assignment) => assignment.role.code === PATIENT_ROLE_CODE),
      canDecide: row.roles.some((assignment) =>
        assignment.role.permissions.some(
          (grant) => grant.permission.permissionKey === DOCUMENT_APPROVAL_DECIDE_PERMISSION_KEY,
        ),
      ),
    }));
  }

  /**
   * Of the approvers named on these rounds, which are still live accounts
   * holding the decide key. One query for the whole page rather than one per
   * round, because the registry list asks this for every row it returns.
   */
  private async findEligibleApproverIdsForRows(
    rows: readonly { approvers: Array<{ approverId: string }> }[],
  ): Promise<ReadonlySet<string>> {
    const approverIds = [...new Set(rows.flatMap((row) => row.approvers.map((a) => a.approverId)))];
    if (approverIds.length === 0) {
      return new Set();
    }
    const eligible = await this.prismaService.user.findMany({
      where: {
        id: { in: approverIds },
        isActive: true,
        isSystem: false,
        deletedAt: null,
        roles: {
          some: {
            deletedAt: null,
            unassignedAt: null,
            role: {
              permissions: {
                some: {
                  permission: { permissionKey: DOCUMENT_APPROVAL_DECIDE_PERMISSION_KEY },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return new Set(eligible.map((row) => row.id));
  }

  private async findEligibleApproverIds(row: RequestRow): Promise<ReadonlySet<string>> {
    return this.findEligibleApproverIdsForRows([row]);
  }

  private toRecord(row: RequestRow, eligibleIds: ReadonlySet<string>): DocumentApprovalRequestRecord {
    return {
      id: row.id,
      documentId: row.documentId,
      status: row.status,
      frozenPayload: row.frozenPayload as unknown as DocumentApprovalFrozenPayload,
      submittedBy: row.submittedBy,
      submittedAt: row.submittedAt,
      dueAt: row.dueAt,
      resolvedAt: row.resolvedAt,
      dueSoonNotifiedAt: row.dueSoonNotifiedAt,
      overdueNotifiedAt: row.overdueNotifiedAt,
      approvers: row.approvers.map((approver) => ({
        approverId: approver.approverId,
        email: approver.approver.email,
        isEligible: eligibleIds.has(approver.approverId),
      })),
      decisions: row.decisions.map((decision) => ({
        id: decision.id,
        approverId: decision.approverId,
        approverEmail: decision.approver.email,
        isApproved: decision.isApproved,
        reason: decision.reason,
        decidedAt: decision.decidedAt,
      })),
    };
  }
}

function buildQueueWhere(
  params: ListDocumentApprovalsParams,
): Prisma.DocumentApprovalRequestWhereInput {
  const conditions: Prisma.DocumentApprovalRequestWhereInput[] = [];
  if (params.approverId !== undefined) {
    conditions.push({ approvers: { some: { approverId: params.approverId } } });
  }
  conditions.push({ status: params.status ?? 'PENDING' });
  if (params.overdueOnly === true) {
    conditions.push({ dueAt: { lt: params.now } });
  }
  return { AND: conditions };
}
