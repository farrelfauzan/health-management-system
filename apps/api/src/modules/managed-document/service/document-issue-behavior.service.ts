import { DocumentTypeBehaviorValue, ManagedDocumentRecord } from '@hms/shared-types';
import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import {
  DocumentIssueBehaviorHandler,
  DocumentIssueContext,
} from './document-issue-behavior.types';

export const DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED_ERROR_CODE = 'DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED';

/**
 * What a type's issue step *does*, beyond moving the row to `ISSUED`
 * (§7.5.2.1). The seam `P16-T29` defined and `P16-T32`/`P16-T33` fill:
 *
 *   * `GENERIC` — nothing else happens. Draft, approve, issue.
 *   * `INVOICE_TEMPLATE` — issue publishes a `DocumentTemplateVersion`
 *     (`P16-T32`).
 *   * `CLINIC_CORPUS` — issue sets `ingestStatus = PENDING`, releasing the
 *     file to the ingestion worker (`P16-T33`).
 *   * `PATIENT_BILL` — never issued through this module; E1 generates the
 *     row already `ISSUED`.
 *
 * Handlers register themselves rather than being injected. The dependency
 * genuinely runs the other way — `document-template` and `document-management`
 * own the side effects and already read this module's type policy — so
 * injecting them here would close two module cycles for no gain. What this
 * service keeps is the invariant: a behaviour with no registered handler
 * **refuses the issue** rather than quietly issuing a row whose side effect
 * never happened. A template that says ISSUED while no version was published,
 * or a corpus document that says ISSUED while the assistant cannot see it, is
 * worse than a clear refusal: the first is a lie the clinic acts on, the
 * second is a bug nobody notices until somebody asks the assistant a question
 * it should have been able to answer.
 */
@Injectable()
export class DocumentIssueBehaviorService {
  private readonly handlers = new Map<DocumentTypeBehaviorValue, DocumentIssueBehaviorHandler>();

  /**
   * Called from an owning module's `onModuleInit`. Registering twice is a
   * wiring mistake rather than a runtime condition, so it throws — the
   * alternative is one of two handlers silently winning.
   */
  registerHandler(handler: DocumentIssueBehaviorHandler): void {
    if (this.handlers.has(handler.behavior)) {
      throw new Error(`A handler for behaviour ${handler.behavior} is already registered`);
    }
    this.handlers.set(handler.behavior, handler);
  }

  /**
   * Refuses before any decision is recorded, so an approver is never told
   * their approval succeeded on a document that could not be issued.
   */
  assertBehaviorSupported(document: ManagedDocumentRecord): void {
    if (this.isSupported(document.type.behavior)) {
      return;
    }
    throw new ConflictException({
      message: buildUnsupportedMessage(document.type.behavior),
      code: DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED_ERROR_CODE,
      errors: { behavior: document.type.behavior },
    });
  }

  /**
   * Runs the behaviour inside the issuing transaction. `GENERIC` has no
   * handler and nothing to do; anything else without one was already refused
   * by {@link assertBehaviorSupported}, and reaching here would mean the
   * check was skipped — so it throws rather than issuing silently.
   */
  async executeIssue(context: DocumentIssueContext, tx: PrismaTransactionClient): Promise<void> {
    const behavior = context.document.type.behavior;
    if (behavior === 'GENERIC') {
      return;
    }
    const handler = this.handlers.get(behavior);
    if (handler === undefined) {
      throw new ConflictException({
        message: buildUnsupportedMessage(behavior),
        code: DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED_ERROR_CODE,
        errors: { behavior },
      });
    }
    await handler.executeIssue(context, tx);
  }

  /**
   * The behaviour's post-commit half, called once the issuing transaction
   * has landed. Best-effort by construction: it is told what already
   * happened, and nothing it does can undo it.
   */
  async announceIssued(context: DocumentIssueContext): Promise<void> {
    await this.handlers.get(context.document.type.behavior)?.announceIssued?.(context);
  }

  private isSupported(behavior: DocumentTypeBehaviorValue): boolean {
    return behavior === 'GENERIC' || this.handlers.has(behavior);
  }
}

function buildUnsupportedMessage(behavior: DocumentTypeBehaviorValue): string {
  if (behavior === 'PATIENT_BILL') {
    return 'A generated patient bill is issued by billing, never through the registry';
  }
  return 'Issuing a document of this type is not wired up yet';
}
