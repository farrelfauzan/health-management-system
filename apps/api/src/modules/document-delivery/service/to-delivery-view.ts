import {
  DeliveryLinkRecord,
  DeliveryLinkView,
  DeliveryRecord,
  DeliveryView,
} from '@hms/shared-types';

/** The timeline row (FR-E4-14). Lease and backoff columns are the worker's, not the cashier's. */
export function toDeliveryView(record: DeliveryRecord): DeliveryView {
  return {
    id: record.id,
    patientId: record.patientId,
    invoiceId: record.invoiceId,
    documentId: record.documentId,
    channel: record.channel,
    shape: record.shape,
    destinationMasked: record.destinationMasked,
    status: record.status,
    attemptCount: record.attemptCount,
    sendAt: record.sendAt?.toISOString() ?? null,
    passwordSource: record.passwordSource,
    lastError: record.lastError,
    sentAt: record.sentAt?.toISOString() ?? null,
    openedAt: record.openedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    requestedBy: record.requestedBy,
    link: record.link === null ? null : toLinkView(record.link),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toLinkView(link: DeliveryLinkRecord): DeliveryLinkView {
  return {
    expiresAt: link.expiresAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
    openCount: link.openCount,
    lastOpenedAt: link.lastOpenedAt?.toISOString() ?? null,
  };
}
