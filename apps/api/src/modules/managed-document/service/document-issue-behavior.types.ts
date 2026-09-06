import { DocumentTypeBehaviorValue, ManagedDocumentRecord } from '@hms/shared-types';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

/**
 * What a behaviour handler is told when a document of its type is issued.
 *
 * `decisionId` is null on the direct-issue path (a type whose approval
 * policy is off) and set to the decision that resolved the round otherwise —
 * the link that lets an auditor run from the approver to the artefact the
 * approval released (NFR-AUD-03).
 */
export type DocumentIssueContext = {
  document: ManagedDocumentRecord;
  /**
   * What is actually being released: the round's frozen payload on the
   * approval path, the live row on the direct-issue one. Never re-read from
   * `document`, whose body may have moved on since the approver saw it —
   * that gap is the whole reason a submission freezes anything (FR-E5-16).
   */
  issuedContent: { contentHtml: string | null; storageKey: string | null };
  actorUserId: string;
  decisionId: string | null;
};

/**
 * The side effect a type's issue step performs beyond moving the row to
 * `ISSUED` (§7.5.2.1).
 *
 * The handler runs **inside the issuing transaction** and is handed that
 * transaction's client, because the whole point of the seam is that a
 * template version and the `ISSUED` row it belongs to commit together or not
 * at all. Owning modules implement this and register themselves with
 * {@link DocumentIssueBehaviorService}; the registry module never imports
 * them, which is what keeps `managed-document` free of a dependency on
 * `document-template` and `document-management`.
 *
 * This contract lives here rather than in `@hms/shared-types` for one
 * reason: it carries a Prisma transaction client. It is API infrastructure
 * and must not leak into a package the web app consumes.
 */
export interface DocumentIssueBehaviorHandler {
  readonly behavior: DocumentTypeBehaviorValue;
  executeIssue(context: DocumentIssueContext, tx: PrismaTransactionClient): Promise<void>;
  /**
   * Optional post-commit work: the audit note naming what was released, the
   * queue nudge for a worker. Runs only once the issuing transaction has
   * committed, which is the same posture `AuditService.record` documents —
   * a best-effort note about a completed operation must never be able to
   * roll that operation back.
   */
  announceIssued?(context: DocumentIssueContext): Promise<void>;
}
