import type { DocumentIngestStatusValue } from '@hms/shared-types';

/**
 * What an ingest status means for the only question the owner actually has:
 * **can the assistant answer from this document yet?**
 *
 * `isAnswerable` is deliberately separate from the status label. A document
 * that has uploaded successfully is not yet retrievable — it has no chunks and
 * no embeddings until the worker reaches it — and a screen that showed a green
 * "uploaded" tick would be telling the owner their guidance is in play when it
 * is not. Only `READY` earns that claim.
 *
 * `NOT_APPLICABLE` cannot occur for a personal document (the API pins
 * `PENDING` at confirm) but is mapped rather than defaulted, so a purpose added
 * later cannot fall through to a wrong answer by omission.
 */
/**
 * A literal union rather than `string`, so the message key the badge builds
 * from it is checked against the message catalogue at compile time instead of
 * failing as a blank label at runtime.
 */
export type PersonalDocumentIngestLabelKey =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'notApplicable';

export type PersonalDocumentIngestState = {
  tone: 'pending' | 'positive' | 'negative' | 'neutral';
  labelKey: PersonalDocumentIngestLabelKey;
  isAnswerable: boolean;
};

const STATE_BY_STATUS: Record<DocumentIngestStatusValue, PersonalDocumentIngestState> = {
  PENDING: { tone: 'pending', labelKey: 'pending', isAnswerable: false },
  PROCESSING: { tone: 'pending', labelKey: 'processing', isAnswerable: false },
  READY: { tone: 'positive', labelKey: 'ready', isAnswerable: true },
  FAILED: { tone: 'negative', labelKey: 'failed', isAnswerable: false },
  NOT_APPLICABLE: { tone: 'neutral', labelKey: 'notApplicable', isAnswerable: false },
};

export function resolvePersonalDocumentIngestState(
  status: DocumentIngestStatusValue,
): PersonalDocumentIngestState {
  return STATE_BY_STATUS[status] ?? STATE_BY_STATUS.NOT_APPLICABLE;
}
