import {
  SatusehatLocationBlockerCheck,
  SatusehatLocationRegistrationBlocker,
} from '@hms/shared-types';

import { findLocationRegistrationBlocker } from '../../../common/satusehat/find-location-registration-blocker';

/**
 * Why one tree row cannot be registered right now, or null (P24-T06).
 *
 * The row's own blockers come first — coordinates, then an unmapped room class
 * (P24-T05) — because those are what the admin fixes on this row. Only then
 * the tree: a non-site row waits for a registered parent, since `partOf` must
 * name a Location SATUSEHAT already holds.
 */
export function findSatusehatLocationEntryBlocker(
  check: SatusehatLocationBlockerCheck,
): SatusehatLocationRegistrationBlocker | null {
  const ownBlocker = findLocationRegistrationBlocker({
    clinicLatitude: check.clinicLatitude,
    clinicLongitude: check.clinicLongitude,
    roomClass: check.entry.roomClass,
  });
  if (ownBlocker !== null || check.entry.kind === 'SITE') {
    return ownBlocker;
  }
  if (check.parent === null) {
    return {
      reason: 'UNREGISTERED_PARENT',
      message:
        check.entry.parentId === null
          ? 'Save the clinic profile and register the clinic site first'
          : 'Its ward or room is inactive or was removed, so it has nothing to belong to',
    };
  }
  if (check.parent.satusehatLocationId === null) {
    return {
      reason: 'UNREGISTERED_PARENT',
      message: `Register "${check.parent.name}" first`,
    };
  }
  return null;
}
