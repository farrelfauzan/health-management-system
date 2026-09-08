import { LabReportRecord, LabReportVersionView, LabReportView } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/** Turns report rows into the wire shapes, dropping nulls to absent. */
@Injectable()
export class LabReportMapper {
  toVersionView(record: LabReportRecord): LabReportVersionView {
    return {
      id: record.id,
      labOrderId: record.labOrderId,
      version: record.version,
      status: record.status,
      isAmended: record.isAmended,
      releasedAt: record.releasedAt.toISOString(),
      documentId: record.documentId ?? undefined,
      attemptCount: record.attemptCount,
      nextAttemptAt: record.nextAttemptAt ? record.nextAttemptAt.toISOString() : undefined,
      lastError: record.lastError ?? undefined,
      renderedAt: record.renderedAt ? record.renderedAt.toISOString() : undefined,
      pageCount: record.pageCount ?? undefined,
      requestedById: record.requestedById,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** `versions` newest first; `current` the newest `READY` one, when there is one. */
  toReportView(labOrderId: string, records: readonly LabReportRecord[]): LabReportView {
    const current = records.find((record) => record.status === 'READY' && record.documentId);
    return {
      labOrderId,
      current: current ? this.toVersionView(current) : undefined,
      versions: records.map((record) => this.toVersionView(record)),
    };
  }
}
