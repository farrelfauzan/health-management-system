import { LabOrderRecord } from '@hms/shared-types';

/** What a sheet says when nobody at this clinic asked for the test. */
const UNATTRIBUTED_REQUESTER = '-';

/**
 * Who asked for the test, as the printed request and the report should name
 * them (P18-T10).
 *
 * An order raised in a consultation names the ordering doctor, as it always
 * did. An external referral names the outside doctor and, where it was given,
 * their practice — the patient's own doctor has to be able to see the result
 * came back against their request. A walk-in names nobody, because nobody
 * asked: a dash is the honest answer, and better than the clinic quietly
 * putting its own name on a test the patient chose.
 */
export function resolveLabRequesterLabel(order: LabOrderRecord): string {
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
