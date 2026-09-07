import type { PatientLabResultView } from '@hms/shared-types';

export type LabResultGroup = {
  labOrderId: string;
  orderNumber: string;
  releasedAt?: string;
  results: PatientLabResultView[];
};

/**
 * Released values grouped by the request they answer (P18-T07).
 *
 * The order is the unit a doctor reads: "the darah rutin I asked for on
 * Tuesday" is one thing with six numbers in it, not six unrelated values that
 * happen to share a date. Groups come back newest first, and the values inside
 * one keep the order the API returned them in.
 */
export function groupLabResultsByOrder(
  results: readonly PatientLabResultView[],
): LabResultGroup[] {
  const groups = new Map<string, LabResultGroup>();
  for (const result of results) {
    const existing = groups.get(result.labOrderId);
    if (existing) {
      existing.results.push(result);
      continue;
    }
    groups.set(result.labOrderId, {
      labOrderId: result.labOrderId,
      orderNumber: result.orderNumber,
      releasedAt: result.releasedAt,
      results: [result],
    });
  }

  return [...groups.values()];
}
