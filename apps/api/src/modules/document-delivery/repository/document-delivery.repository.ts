import { Injectable } from '@nestjs/common';

import {
  CancelDeliveryData,
  ClaimDueDeliveriesPayload,
  ClinicalDeliverySubjectRecord,
  CreateDeliveryData,
  CreateDeliveryLinkData,
  DeliveryLinkLookupRecord,
  DeliveryLinkRecord,
  DeliveryRecord,
  DeliveryStatusValue,
  deliveryPasswordSourceSchema,
  RecordDeliveryLinkOpenData,
  RescheduleDeliveryAttemptData,
  SettleDeliveryFailedData,
  SettleDeliverySentData,
  UpdateDeliveryScheduleData,
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

const MILLISECONDS_PER_SECOND = 1_000;

type ClaimedRow = { id: string };

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

  /** The timeline of one released clinical document (`P16-T40`), newest first. */
  async findByDocument(documentId: string): Promise<DeliveryRecord[]> {
    const rows = await this.prisma.documentDelivery.findMany({
      where: { documentId },
      orderBy: [{ createdAt: 'desc' }, { channel: 'asc' }],
      select: DELIVERY_SELECT,
    });
    return rows.map(toDeliveryRecord);
  }

  /**
   * The clinical file a dispatch carries and the patient it belongs to
   * (`P16-T40`), or null when no such live clinical file exists. Read here
   * rather than through the document module's service because that module
   * is the one calling *in* at release time — the dependency runs from the
   * record to the pipe, never back. A soft-deleted row is returned with
   * `isDeleted` set so the worker can cancel a queued send with the reason
   * on the timeline rather than failing it.
   */
  async findClinicalDeliverySubject(
    documentId: string,
  ): Promise<ClinicalDeliverySubjectRecord | null> {
    const row = await this.prisma.document.findFirst({
      where: { id: documentId, purpose: 'PATIENT_CLINICAL' },
      select: {
        id: true,
        title: true,
        category: true,
        documentDate: true,
        mimeType: true,
        storageKey: true,
        patientId: true,
        encounterId: true,
        releasedToPatient: true,
        deletedAt: true,
        patient: {
          select: {
            id: true,
            mrn: true,
            fullName: true,
            dateOfBirth: true,
            phoneNumber: true,
            email: true,
          },
        },
      },
    });
    if (row === null || row.patient === null || row.patientId === null) {
      return null;
    }
    return {
      document: {
        id: row.id,
        title: row.title,
        category: row.category ?? 'OTHER',
        documentDate: row.documentDate,
        mimeType: row.mimeType,
        storageKey: row.storageKey,
        patientId: row.patientId,
        encounterId: row.encounterId,
        releasedToPatient: row.releasedToPatient,
        isDeleted: row.deletedAt !== null,
      },
      patient: row.patient,
    };
  }

  async findByInvoice(invoiceId: string): Promise<DeliveryRecord[]> {
    const rows = await this.prisma.documentDelivery.findMany({
      where: { invoiceId },
      orderBy: [{ createdAt: 'desc' }, { channel: 'asc' }],
      select: DELIVERY_SELECT,
    });
    return rows.map(toDeliveryRecord);
  }

  /**
   * Claims up to `limit` due rows for one worker replica and returns them
   * (`P16-T26`, FR-E4-13). Selecting and updating in one statement under
   * `FOR UPDATE SKIP LOCKED` is what makes two replicas safe: each row goes
   * to exactly one claimer, so the same bill is never sent twice.
   *
   * Due means QUEUED, past its `send_at` (`P16-T38` parks a scheduled send
   * here with one predicate, FR-E4-09), past its backoff, and not under a
   * live lease. The lease is `leased_until`, not a status change: a worker
   * that dies mid-send releases its rows when the lease lapses, with no
   * reaper and no half-processed state. Oldest due first, so a scheduled
   * send that came due at 09:00 is not queued behind a burst requested at
   * 09:05.
   */
  async claimDueDeliveries(payload: ClaimDueDeliveriesPayload): Promise<DeliveryRecord[]> {
    const leaseSeconds = payload.leaseMs / MILLISECONDS_PER_SECOND;
    const claimed = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "document_deliveries"
      SET "leased_until" = now() + make_interval(secs => ${leaseSeconds}::double precision),
          "leased_by" = ${payload.leasedBy},
          "updated_at" = now()
      WHERE "id" IN (
        SELECT "id"
        FROM "document_deliveries"
        WHERE "status" = 'QUEUED'::"delivery_status"
          AND ("send_at" IS NULL OR "send_at" <= now())
          AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= now())
          AND ("leased_until" IS NULL OR "leased_until" <= now())
        ORDER BY COALESCE("next_attempt_at", "send_at", "created_at") ASC
        LIMIT ${payload.limit}::integer
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `;
    if (claimed.length === 0) {
      return [];
    }
    const rows = await this.prisma.documentDelivery.findMany({
      where: { id: { in: claimed.map((row) => row.id) } },
      orderBy: { createdAt: 'asc' },
      select: DELIVERY_SELECT,
    });
    return rows.map(toDeliveryRecord);
  }

  async markSent(data: SettleDeliverySentData): Promise<void> {
    await this.prisma.documentDelivery.update({
      where: { id: data.id },
      data: {
        status: DeliveryStatus.SENT,
        sentAt: data.sentAt,
        providerMessageId: data.providerMessageId,
        attemptCount: { increment: 1 },
        lastError: null,
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /** A transient failure: count the attempt, record why, and park the row until the backoff passes. */
  async rescheduleAttempt(data: RescheduleDeliveryAttemptData): Promise<void> {
    await this.prisma.documentDelivery.update({
      where: { id: data.id },
      data: {
        attemptCount: { increment: 1 },
        lastError: data.error,
        nextAttemptAt: data.nextAttemptAt,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  async markFailed(data: SettleDeliveryFailedData): Promise<void> {
    await this.prisma.documentDelivery.update({
      where: { id: data.id },
      data: {
        status: DeliveryStatus.FAILED,
        attemptCount: { increment: 1 },
        lastError: data.error,
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /** QUEUED → CANCELLED, whoever called it off. The predicate is the guard. */
  async markCancelled(data: CancelDeliveryData): Promise<boolean> {
    const result = await this.prisma.documentDelivery.updateMany({
      where: { id: data.id, status: DeliveryStatus.QUEUED },
      data: {
        status: DeliveryStatus.CANCELLED,
        lastError: data.reason,
        revokedAt: data.cancelledAt,
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
    return result.count === 1;
  }

  /** Moves a QUEUED send; a row already claimed or sent is left alone. */
  async updateSchedule(data: UpdateDeliveryScheduleData): Promise<boolean> {
    const result = await this.prisma.documentDelivery.updateMany({
      where: { id: data.id, status: DeliveryStatus.QUEUED, leasedUntil: null },
      data: { sendAt: data.sendAt, nextAttemptAt: null },
    });
    return result.count === 1;
  }

  /** How many messages left the building since `since` — the daily cap's input. */
  async countSentSince(since: Date): Promise<number> {
    return this.prisma.documentDelivery.count({ where: { sentAt: { gte: since } } });
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
