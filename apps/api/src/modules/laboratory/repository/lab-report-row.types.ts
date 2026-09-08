import { LabReportStatusValue } from '@hms/shared-types';

/**
 * Persistence-shaped rows for lab reports — what the report repository asks
 * Prisma for. Adapter internals, and therefore in `apps/api` rather than in
 * `@hms/shared-types`, the same exception `lab-result-row.types.ts` takes.
 */
export type LabReportRow = {
  id: string;
  labOrderId: string;
  version: number;
  status: LabReportStatusValue;
  isAmended: boolean;
  releasedAt: Date;
  documentId: string | null;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  renderedAt: Date | null;
  pageCount: number | null;
  requestedById: string;
  createdAt: Date;
};

/** A report with the stored object its document points at. */
export type LabReportFileRow = LabReportRow & {
  document: { storageKey: string } | null;
};
