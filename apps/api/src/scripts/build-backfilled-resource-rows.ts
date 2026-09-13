import { SatusehatSubmissionResourcePayload } from '@hms/shared-types';

import { resolveBackfilledLocalRecordId } from './resolve-backfilled-local-record-id';

/**
 * Turns the resources a `?encounter=` search returned into rows for the
 * P21-T02 list (P21-T05).
 *
 * Every row is marked `isBackfilled`, which is what lets the monitor say that
 * skipped items are unknown for it: what a submission *left out* cannot be
 * reconstructed from what the platform holds, only what it sent.
 */
export function buildBackfilledResourceRows(input: {
  resourceType: string;
  resources: readonly unknown[];
  organizationId: string;
}): SatusehatSubmissionResourcePayload[] {
  return input.resources.flatMap((resource) => {
    if (typeof resource !== 'object' || resource === null) {
      return [];
    }
    const source = resource as Record<string, unknown>;
    const satusehatId = typeof source['id'] === 'string' ? source['id'] : null;
    if (satusehatId === null || satusehatId === '') {
      return [];
    }
    return [
      {
        resourceType: input.resourceType,
        outcome: 'SENT' as const,
        skipReason: null,
        satusehatId,
        localRecordId: resolveBackfilledLocalRecordId({
          resourceType: input.resourceType,
          identifier: source['identifier'],
          organizationId: input.organizationId,
        }),
        isBackfilled: true,
      },
    ];
  });
}
