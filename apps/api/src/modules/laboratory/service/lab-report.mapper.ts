import {
  LAB_REPORT_CONFIGURATION_FAILURE_CODES,
  LAB_REPORT_CONFIGURATION_FAILURE_MESSAGES,
  LabReportConfigurationFailureCode,
  LabReportRecord,
  LabReportVersionView,
  LabReportView,
} from '@hms/shared-types';
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
      configurationFailure: resolveConfigurationFailure(record),
      renderedAt: record.renderedAt ? record.renderedAt.toISOString() : undefined,
      pageCount: record.pageCount ?? undefined,
      requestedById: record.requestedById,
      note: record.note ?? undefined,
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

/**
 * A FAILED row whose stored reason is one of the registry's messages was
 * parked by a configuration failure (P18-T16). Read back from the message
 * rather than a column of its own: the message is the registry's, verbatim,
 * and a retry that later fails for a transient reason overwrites it. Only a
 * FAILED row qualifies — a re-opened one is trying again.
 */
function resolveConfigurationFailure(
  record: LabReportRecord,
): LabReportConfigurationFailureCode | undefined {
  if (record.status !== 'FAILED' || record.lastError === null) {
    return undefined;
  }
  return LAB_REPORT_CONFIGURATION_FAILURE_CODES.find(
    (code) => LAB_REPORT_CONFIGURATION_FAILURE_MESSAGES[code] === record.lastError,
  );
}
