import type { DocumentIngestStatusValue } from '@hms/shared-types';

/**
 * A literal union rather than `string`, so the message key a badge builds from
 * it is checked against the message catalogue at compile time instead of
 * failing as a blank label at runtime.
 */
export type DocumentIngestLabelKey =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'notApplicable';

export type DocumentIngestState = {
  tone: 'pending' | 'positive' | 'negative' | 'neutral';
  labelKey: DocumentIngestLabelKey;
  isAnswerable: boolean;
};

const STATE_BY_STATUS: Record<DocumentIngestStatusValue, DocumentIngestState> = {
  PENDING: { tone: 'pending', labelKey: 'pending', isAnswerable: false },
  PROCESSING: { tone: 'pending', labelKey: 'processing', isAnswerable: false },
  READY: { tone: 'positive', labelKey: 'ready', isAnswerable: true },
  FAILED: { tone: 'negative', labelKey: 'failed', isAnswerable: false },
  NOT_APPLICABLE: { tone: 'neutral', labelKey: 'notApplicable', isAnswerable: false },
};

/**
 * What an ingest status means for the only question anyone looking at a
 * document actually has: **can the assistant answer from this yet?**
 *
 * `isAnswerable` is deliberately separate from the status label. A document
 * that has uploaded successfully is not yet retrievable — it has no chunks and
 * no embeddings until the worker reaches it — and a screen that showed a green
 * "uploaded" tick would be claiming the guidance is in play when it is not.
 * Only `READY` earns that claim.
 *
 * Shared by the personal knowledge base and the clinic corpus rather than
 * copied into each: both read the same column written by the same worker, and
 * two tables that could disagree about what `PROCESSING` means is precisely
 * the drift worth designing out. `NOT_APPLICABLE` cannot occur for either
 * today (both pin `PENDING` at confirm) but is mapped rather than defaulted,
 * so a purpose added later cannot fall through to a wrong answer by omission.
 */
export function resolveDocumentIngestState(
  status: DocumentIngestStatusValue,
): DocumentIngestState {
  return STATE_BY_STATUS[status] ?? STATE_BY_STATUS.NOT_APPLICABLE;
}
