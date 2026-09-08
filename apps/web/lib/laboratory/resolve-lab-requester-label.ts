import type { LabOrderView } from '@hms/shared-types';

/** What a screen shows when nobody at this clinic asked for the test. */
const UNATTRIBUTED_REQUESTER = '—';

/**
 * Who asked for the test (P18-T10). Mirrors the API's own label so the screen
 * and the printed sheet never disagree about who requested a result: the
 * ordering doctor, or the outside doctor and their practice, or a dash for a
 * walk-in the patient chose for themselves.
 */
export function resolveLabRequesterLabel(order: LabOrderView): string {
  if (order.orderedByName) {
    return order.orderedByName;
  }
  if (!order.externalRequesterName) {
    return UNATTRIBUTED_REQUESTER;
  }
  return order.externalRequesterFacility
    ? `${order.externalRequesterName} (${order.externalRequesterFacility})`
    : order.externalRequesterName;
}
