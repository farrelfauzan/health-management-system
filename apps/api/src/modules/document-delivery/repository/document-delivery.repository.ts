import { Injectable } from '@nestjs/common';

import {
  CreateDeliveryData,
  CreateDeliveryLinkData,
  DeliveryLinkLookupRecord,
  DeliveryLinkRecord,
  DeliveryRecord,
  DeliveryStatusValue,
  deliveryPasswordSourceSchema,
  RecordDeliveryLinkOpenData,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeliveryStatus, Prisma } from '../../../generated/prisma/client';

const LINK_SELECT = {
  id: true,
  deliveryId: true,
  expiresAt: true,
  revokedAt: true,
  openCount: true,
  lastOpenedAt: true,
} satisfies Prisma.DocumentDeliveryLinkSelect;

/**
 * The row shape every delivery read selects, so a future column cannot leak
 * through a `select`-less read. No destination column exists to leak.
 */
const DELIVERY_SELECT = {
  id: true,
  patientId: true,
  invoiceId: true,
  invoiceDocumentId: true,
  documentId: true,
  channel: true,
  shape: true,
  destinationMasked: true,
  status: true,
  attemptCount: true,
  sendAt: true,
  nextAttemptAt: true,
  leasedUntil: true,
  leasedBy: true,
  passwordSource: true,
  providerMessageId: true,
  lastError: true,
  sentAt: true,
  openedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, email: true } },
  link: { select: LINK_SELECT },
} satisfies Prisma.DocumentDeliverySelect;

type DeliveryRow = Prisma.DocumentDeliveryGetPayload<{ select: typeof DELIVERY_SELECT }>;

type LinkRow = Prisma.DocumentDeliveryLinkGetPayload<{ select: typeof LINK_SELECT }>;

/** The states a link may still be opened from: the message has gone out. */
const OPENABLE_STATUSES: readonly DeliveryStatus[] = [
  DeliveryStatus.SENT,
  DeliveryStatus.DELIVERED,
  DeliveryStatus.OPENED,
];

/**
 * Persistence for the delivery pipeline (`P16-T25`): the rows a send creates,
 * the timeline reads, and the two state changes staff can make by hand —
 * retry and revoke. Both are conditional `updateMany` calls so the predicate
 * is the guard: a retry that races a worker claim changes nothing rather
 * than resurrecting a row the worker is about to settle.
 */
@Injectable()
export class DocumentDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One row per channel, in one transaction: a two-channel send is one act. */
  async createMany(entries: readonly CreateDeliveryData[]): Promise<DeliveryRecord[]> {
    const rows = await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.documentDelivery.create({
          data: {
            patientId: entry.patientId,
            invoiceId: entry.invoiceId,
            invoiceDocumentId: entry.invoiceDocumentId,
            documentId: entry.documentId,
            channel: entry.channel,
            shape: entry.shape,
            destinationMasked: entry.destinationMasked,
            passwordSource: entry.passwordSource,
            requestedById: entry.requestedById,
            sendAt: entry.sendAt,
          },
          select: DELIVERY_SELECT,
        }),
      ),
    );
    return rows.map(toDeliveryRecord);
  }

  async findById(id: string): Promise<DeliveryRecord | null> {
    const row = await this.prisma.documentDelivery.findUnique({
      where: { id },
      select: DELIVERY_SELECT,
    });
    return row === null ? null : toDeliveryRecord(row);
  }

  async findByInvoice(invoiceId: string): Promise<DeliveryRecord[]> {
    const rows = await this.prisma.documentDelivery.findMany({
      where: { invoiceId },
      orderBy: [{ createdAt: 'desc' }, { channel: 'asc' }],
      select: DELIVERY_SELECT,
    });
    return rows.map(toDeliveryRecord);
  }

  /** FAILED → QUEUED, with the backoff and any stale lease cleared. */
  async markRetried(id: string): Promise<boolean> {
    const result = await this.prisma.documentDelivery.updateMany({
      where: { id, status: DeliveryStatus.FAILED },
      data: {
        status: DeliveryStatus.QUEUED,
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
    return result.count === 1;
  }

  /**
   * Settles the row REVOKED and kills its link in the same transaction, so a
   * token never outlives the delivery it belongs to. `fromStatuses` is the
   * service's rule about which states may be revoked; the predicate enforces
   * it against whatever the row has become since the service read it.
   */
  async markRevoked(params: {
    id: string;
    revokedAt: Date;
    fromStatuses: readonly DeliveryStatusValue[];
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.documentDelivery.updateMany({
        where: { id: params.id, status: { in: [...params.fromStatuses] } },
        data: { status: DeliveryStatus.REVOKED, revokedAt: params.revokedAt },
      });
      if (result.count !== 1) {
        return false;
      }
      await tx.documentDeliveryLink.updateMany({
        where: { deliveryId: params.id, revokedAt: null },
        data: { revokedAt: params.revokedAt },
      });
      return true;
    });
  }

  async createLink(data: CreateDeliveryLinkData): Promise<DeliveryLinkRecord> {
    const row = await this.prisma.documentDeliveryLink.create({
      data: {
        deliveryId: data.deliveryId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
      select: LINK_SELECT,
    });
    return toLinkRecord(row);
  }

  /**
   * The public route's one read. Fetches the state of the bill behind the
   * token too (FR-E4-20): a voided invoice makes its links stop resolving
   * without anyone having to revoke them.
   */
  async findLinkByTokenHash(tokenHash: string): Promise<DeliveryLinkLookupRecord | null> {
    const row = await this.prisma.documentDeliveryLink.findUnique({
      where: { tokenHash },
      select: {
        ...LINK_SELECT,
        delivery: {
          select: {
            id: true,
            patientId: true,
            status: true,
            invoice: { select: { id: true, invoiceNumber: true, status: true } },
            invoiceDocument: { select: { storageKey: true } },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }
    const { delivery, ...link } = row;
    return {
      link: toLinkRecord(link),
      delivery: { id: delivery.id, patientId: delivery.patientId, status: delivery.status },
      invoice: delivery.invoice,
      storageKey: delivery.invoiceDocument?.storageKey ?? null,
    };
  }

  /**
   * Counts an open on the link and moves the delivery to OPENED. The first
   * open sets `openedAt`; later ones only bump the count, so the timeline's
   * "opened at" stays the moment the patient first saw it.
   */
  async recordLinkOpen(data: RecordDeliveryLinkOpenData): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.documentDeliveryLink.update({
        where: { id: data.linkId },
        data: { openCount: { increment: 1 }, lastOpenedAt: data.openedAt },
      }),
      this.prisma.documentDelivery.updateMany({
        where: { id: data.deliveryId, status: { in: [...OPENABLE_STATUSES] }, openedAt: null },
        data: { openedAt: data.openedAt },
      }),
      this.prisma.documentDelivery.updateMany({
        where: { id: data.deliveryId, status: { in: [...OPENABLE_STATUSES] } },
        data: { status: DeliveryStatus.OPENED },
      }),
    ]);
  }
}

function toLinkRecord(row: LinkRow): DeliveryLinkRecord {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    openCount: row.openCount,
    lastOpenedAt: row.lastOpenedAt,
  };
}

function toDeliveryRecord(row: DeliveryRow): DeliveryRecord {
  const passwordSource = deliveryPasswordSourceSchema.safeParse(row.passwordSource);
  return {
    id: row.id,
    patientId: row.patientId,
    invoiceId: row.invoiceId,
    invoiceDocumentId: row.invoiceDocumentId,
    documentId: row.documentId,
    channel: row.channel,
    shape: row.shape,
    destinationMasked: row.destinationMasked,
    status: row.status,
    attemptCount: row.attemptCount,
    sendAt: row.sendAt,
    nextAttemptAt: row.nextAttemptAt,
    leasedUntil: row.leasedUntil,
    leasedBy: row.leasedBy,
    passwordSource: passwordSource.success ? passwordSource.data : null,
    providerMessageId: row.providerMessageId,
    lastError: row.lastError,
    sentAt: row.sentAt,
    openedAt: row.openedAt,
    revokedAt: row.revokedAt,
    requestedBy: row.requestedBy,
    link: row.link === null ? null : toLinkRecord(row.link),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
