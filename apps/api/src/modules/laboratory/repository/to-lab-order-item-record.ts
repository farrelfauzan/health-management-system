import { LabOrderItemRecord } from '@hms/shared-types';

import { LabOrderItemRow } from './lab-order-row.types';

/**
 * Flattens the test's identity onto the item. Every consumer — order detail,
 * worklist, label — needs the code and name, and none of them should have to
 * re-read the catalog to get them.
 */
export function toLabOrderItemRecord(row: LabOrderItemRow): LabOrderItemRecord {
  return {
    id: row.id,
    labTestId: row.labTestId,
    code: row.labTest.code,
    name: row.labTest.name,
    specimenType: row.labTest.specimenType,
    resultType: row.labTest.resultType,
    status: row.status,
    panelId: row.panelId,
    panelName: row.panel?.name ?? null,
    specimenId: row.specimenId,
  };
}
