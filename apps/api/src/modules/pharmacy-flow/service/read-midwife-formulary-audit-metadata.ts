import { MidwifeFormularyApplyItemResponse } from '@hms/shared-types';

/**
 * What the one audit row for applying the midwife formulary says (P25-T04):
 * the catalog ids newly flagged and the ones the clinic re-confirmed. Read
 * from the response envelope by `AuditInterceptor`; identifiers only.
 */
export function readMidwifeFormularyAuditMetadata(responseBody: unknown): Record<string, unknown> {
  const items = readItems(responseBody);
  return {
    flaggedMedicationIds: items
      .filter((item) => item.outcome === 'FLAGGED')
      .map((item) => item.medicationId),
    alreadyFlaggedMedicationIds: items
      .filter((item) => item.outcome === 'ALREADY_FLAGGED')
      .map((item) => item.medicationId),
  };
}

function readItems(responseBody: unknown): MidwifeFormularyApplyItemResponse[] {
  if (typeof responseBody !== 'object' || responseBody === null) {
    return [];
  }
  const data = (responseBody as { data?: { items?: unknown } }).data;
  const items = data?.items;
  return Array.isArray(items) ? (items as MidwifeFormularyApplyItemResponse[]) : [];
}
