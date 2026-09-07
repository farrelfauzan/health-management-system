import { LabSpecimenRecord } from '@hms/shared-types';

import { LabSpecimenRow } from './lab-order-row.types';

/** A specimen row as the domain sees it. Nothing to flatten; nulls stay nulls. */
export function toLabSpecimenRecord(row: LabSpecimenRow): LabSpecimenRecord {
  return {
    id: row.id,
    labOrderId: row.labOrderId,
    specimenType: row.specimenType,
    accessionNumber: row.accessionNumber,
    collectedAt: row.collectedAt,
    collectedById: row.collectedById,
    receivedAt: row.receivedAt,
    status: row.status,
    rejectedAt: row.rejectedAt,
    rejectReason: row.rejectReason,
    rejectNotes: row.rejectNotes,
    notes: row.notes,
  };
}
