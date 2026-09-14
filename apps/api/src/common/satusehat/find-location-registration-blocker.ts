import {
  SatusehatLocationRegistrationBlocker,
  SatusehatLocationRegistrationCheckInput,
} from '@hms/shared-types';

/**
 * Why a row cannot be registered as a SATUSEHAT Location yet, or `null` when
 * nothing on the clinic's side stands in the way (P24-T05).
 *
 * Two predicates, checked in the order an admin can fix them:
 *
 * - **Coordinates** (FR-LOC-01). Every Location carries the clinic's position.
 *   Staging does not enforce it (P24-T01), but the Location page marks it
 *   mandatory, so registration waits for both values rather than sending a
 *   Location production may refuse.
 * - **Service class** (FR-LOC-05), for rooms and beds only. A room whose class
 *   has no SATUSEHAT mapping cannot say which inpatient class it is, and the
 *   message names the class, because that is the row the admin has to edit.
 *
 * P24-T06 turns a blocker into a `BLOCKED` node; an unregistered parent is its
 * own reason there, since it depends on the tree rather than on this row.
 */
export function findLocationRegistrationBlocker(
  input: SatusehatLocationRegistrationCheckInput,
): SatusehatLocationRegistrationBlocker | null {
  if (input.clinicLatitude === null || input.clinicLongitude === null) {
    return {
      reason: 'MISSING_COORDINATES',
      message: "Set the clinic's latitude and longitude before registering locations",
    };
  }
  if (input.roomClass !== null && input.roomClass.satusehatServiceClass === null) {
    return {
      reason: 'UNMAPPED_SERVICE_CLASS',
      message: `Room class "${input.roomClass.name}" has no SATUSEHAT service class`,
    };
  }
  return null;
}
