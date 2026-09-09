import {
  ClaimDueLabReportsPayload,
  EnqueueLabReportPayload,
  FileLabReportDocumentPayload,
  LabReportFileRecord,
  LabReportRecord,
  LabReportVerifierRecord,
  RescheduleLabReportPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabReportFileRow, LabReportRow } from './lab-report-row.types';

const MILLISECONDS_PER_SECOND = 1_000;

const PDF_MIME_TYPE = 'application/pdf';

const FIRST_VERSION = 1;

const LAB_REPORT_SELECT = {
  id: true,
  labOrderId: true,
  version: true,
  status: true,
  isAmended: true,
  releasedAt: true,
  documentId: true,
  attemptCount: true,
  nextAttemptAt: true,
  lastError: true,
  renderedAt: true,
  pageCount: true,
  requestedById: true,
  note: true,
  createdAt: true,
} as const;

type ClaimedRow = { id: string };

type TransactionClient = Parameters<Parameters<PrismaService['executeTransaction']>[0]>[0];

/**
 * Persistence for the hasil laboratorium (P18-T05): the version rows, the
 * lease the worker claims them under, and the patient clinical file each one
 * becomes.
 *
 * The claim is the delivery outbox's claim — `FOR UPDATE SKIP LOCKED` under a
 * lease — so two API replicas never render the same version twice. The file
 * is an ordinary `PATIENT_CLINICAL` document in the `LAB_RESULT` category,
 * created already released: it is rendered *from* a release, and a report
 * the verifier signed out is not something a second person then decides to
 * show the patient.
 */
@Injectable()
export class LabReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queues the next version. The version number is allocated inside the
   * transaction against the order's current maximum, and the unique index on
   * `(lab_order_id, version)` is what makes a release and an amendment racing
   * fail loudly rather than both becoming v2.
   */
  async enqueue(payload: EnqueueLabReportPayload): Promise<LabReportRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      const latest = await tx.labReport.aggregate({
        where: { labOrderId: payload.labOrderId },
        _max: { version: true },
      });
      const row = await tx.labReport.create({
        data: {
          labOrderId: payload.labOrderId,
          version: (latest._max.version ?? 0) + FIRST_VERSION,
          isAmended: payload.isAmended,
          releasedAt: payload.releasedAt,
          requestedById: payload.requestedById,
          note: payload.note,
        },
        select: LAB_REPORT_SELECT,
      });
      return toLabReportRecord(row);
    });
  }

  async claimDueReports(payload: ClaimDueLabReportsPayload): Promise<LabReportRecord[]> {
    const leaseSeconds = payload.leaseMs / MILLISECONDS_PER_SECOND;
    const claimed = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "lab_reports"
      SET "leased_until" = now() + make_interval(secs => ${leaseSeconds}::double precision),
          "leased_by" = ${payload.leasedBy},
          "updated_at" = now()
      WHERE "id" IN (
        SELECT "id"
        FROM "lab_reports"
        WHERE "status" = 'PENDING'::"lab_report_status"
          AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= now())
          AND ("leased_until" IS NULL OR "leased_until" <= now())
        ORDER BY COALESCE("next_attempt_at", "created_at") ASC
        LIMIT ${payload.limit}::integer
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `;
    if (claimed.length === 0) {
      return [];
    }
    const rows = await this.prisma.labReport.findMany({
      where: { id: { in: claimed.map((row) => row.id) } },
      orderBy: { createdAt: 'asc' },
      select: LAB_REPORT_SELECT,
    });
    return rows.map(toLabReportRecord);
  }

  async findById(id: string): Promise<LabReportRecord | null> {
    const row = await this.prisma.labReport.findUnique({
      where: { id },
      select: LAB_REPORT_SELECT,
    });
    return row === null ? null : toLabReportRecord(row);
  }

  /** Every version of one order's report, newest first. */
  async listByOrderId(labOrderId: string): Promise<LabReportRecord[]> {
    const rows = await this.prisma.labReport.findMany({
      where: { labOrderId },
      orderBy: { version: 'desc' },
      select: LAB_REPORT_SELECT,
    });
    return rows.map(toLabReportRecord);
  }

  /** The latest `READY` version with a live file — what a download means. */
  async findCurrentFileByOrderId(labOrderId: string): Promise<LabReportFileRecord | null> {
    const row = await this.prisma.labReport.findFirst({
      where: { labOrderId, status: 'READY', document: { deletedAt: null } },
      orderBy: { version: 'desc' },
      select: { ...LAB_REPORT_SELECT, document: { select: { storageKey: true } } },
    });
    if (row === null || row.document === null) {
      return null;
    }
    return { ...toLabReportRecord(row as LabReportFileRow), storageKey: row.document.storageKey };
  }

  /**
   * Files the rendered bytes as the patient's clinical document and marks the
   * version `READY`, in one transaction — a `READY` row with no file is the
   * state the CHECK constraint refuses, and this is the only writer of both.
   *
   * Created released: `releasedToPatient` on, released by the verifier at the
   * moment of filing. Delivery reads that flag, and the document panel shows
   * it as released — which it is, by the signature that produced it.
   */
  async fileDocument(payload: FileLabReportDocumentPayload): Promise<{ documentId: string }> {
    return this.prisma.executeTransaction(async (tx: TransactionClient) => {
      const now = new Date();
      const created = await tx.document.create({
        data: {
          ownerType: 'PATIENT',
          purpose: 'PATIENT_CLINICAL',
          title: payload.title,
          storageKey: payload.storageKey,
          mimeType: PDF_MIME_TYPE,
          sizeBytes: payload.sizeBytes,
          uploadedById: payload.actorUserId,
          patientId: payload.patientId,
          encounterId: payload.encounterId,
          category: 'LAB_RESULT',
          documentDate: payload.documentDate,
          releasedToPatient: true,
          releasedAt: now,
          releasedById: payload.actorUserId,
        },
        select: { id: true },
      });
      await tx.labReport.update({
        where: { id: payload.reportId },
        data: {
          status: 'READY',
          documentId: created.id,
          pageCount: payload.pageCount,
          renderedAt: now,
          attemptCount: { increment: 1 },
          lastError: null,
          nextAttemptAt: null,
          leasedUntil: null,
          leasedBy: null,
        },
      });
      return { documentId: created.id };
    });
  }

  /**
   * A render that failed. With a `nextAttemptAt` the row stays `PENDING` and
   * the worker comes back for it; without one it is parked `FAILED`, where
   * the order detail can say why and the next amendment queues a fresh row.
   */
  async rescheduleAttempt(payload: RescheduleLabReportPayload): Promise<void> {
    await this.prisma.labReport.update({
      where: { id: payload.id },
      data: {
        status: payload.nextAttemptAt === null ? 'FAILED' : 'PENDING',
        attemptCount: { increment: 1 },
        lastError: payload.error,
        nextAttemptAt: payload.nextAttemptAt,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /**
   * Who signed the report out, for the sheet. A `User` has no display name;
   * a doctor's profile does, and a report verified by a doctor prints it. A
   * technician or an administrator prints the account's e-mail, which is the
   * name the clinic knows them by until somebody gives staff a profile.
   */
  /**
   * Re-opens a render for another go (P18-T05).
   *
   * The attempt budget resets, because the reason a retry is asked for is that
   * the cause was fixed — a clinic profile filled in, a renderer brought back
   * — and a row that failed five times should get the full schedule again
   * rather than one grudging attempt. Due immediately: somebody is waiting at
   * the counter for the sheet.
   */
  async requeueReport(id: string): Promise<boolean> {
    const result = await this.prisma.labReport.updateMany({
      where: {
        id,
        status: { not: 'READY' },
        // Never yank a lease a worker is still holding: two workers rendering
        // one version would file the same sheet twice. The condition lives in
        // the WHERE rather than in a prior read, so a render that starts
        // between the check and the write still wins.
        OR: [{ leasedUntil: null }, { leasedUntil: { lte: new Date() } }],
      },
      data: {
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        leasedUntil: null,
        leasedBy: null,
      },
    });
    return result.count === 1;
  }

  async findVerifier(userId: string): Promise<LabReportVerifierRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, doctorProfile: { select: { fullName: true } } },
    });
    if (user === null) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email,
      displayName: user.doctorProfile?.fullName ?? user.email,
    };
  }
}

function toLabReportRecord(row: LabReportRow): LabReportRecord {
  return {
    id: row.id,
    labOrderId: row.labOrderId,
    version: row.version,
    status: row.status,
    isAmended: row.isAmended,
    releasedAt: row.releasedAt,
    documentId: row.documentId,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    renderedAt: row.renderedAt,
    pageCount: row.pageCount,
    requestedById: row.requestedById,
    note: row.note,
    createdAt: row.createdAt,
  };
}
