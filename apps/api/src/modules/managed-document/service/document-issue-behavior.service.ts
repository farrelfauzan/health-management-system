import { ManagedDocumentRecord } from '@hms/shared-types';
import { ConflictException, Injectable } from '@nestjs/common';

export const DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED_ERROR_CODE = 'DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED';

/**
 * What a type's issue step *does*, beyond moving the row to `ISSUED`
 * (§7.5.2.1). The seam `P16-T29` defines and `P16-T32`/`P16-T33` fill:
 *
 *   * `GENERIC` — nothing else happens. Draft, approve, issue.
 *   * `INVOICE_TEMPLATE` — issue publishes a `DocumentTemplateVersion`
 *     (`P16-T32`).
 *   * `CLINIC_CORPUS` — issue sets `ingestStatus = PENDING`, releasing the
 *     file to the ingestion worker (`P16-T33`).
 *   * `PATIENT_BILL` — never issued through this module; E1 generates the
 *     row already `ISSUED`.
 *
 * Until T32/T33 land, the two unimplemented behaviours **refuse the issue**
 * rather than quietly issuing a row whose side effect never happened. A
 * template that says ISSUED while no version was published, or a corpus
 * document that says ISSUED while the assistant cannot see it, is worse than
 * a clear refusal: the first is a lie the clinic acts on, the second is a
 * bug nobody notices until somebody asks the assistant a question it should
 * have been able to answer.
 */
@Injectable()
export class DocumentIssueBehaviorService {
  /**
   * Refuses before any decision is recorded, so an approver is never told
   * their approval succeeded on a document that could not be issued.
   */
  assertBehaviorSupported(document: ManagedDocumentRecord): void {
    if (document.type.behavior === 'GENERIC') {
      return;
    }
    throw new ConflictException({
      message: buildUnsupportedMessage(document.type.behavior),
      code: DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED_ERROR_CODE,
      errors: { behavior: document.type.behavior },
    });
  }
}

function buildUnsupportedMessage(behavior: ManagedDocumentRecord['type']['behavior']): string {
  if (behavior === 'PATIENT_BILL') {
    return 'A generated patient bill is issued by billing, never through the registry';
  }
  return 'Issuing a document of this type is not wired up yet';
}
