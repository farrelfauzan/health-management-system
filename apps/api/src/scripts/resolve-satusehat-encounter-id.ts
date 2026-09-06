import { SatusehatSearchBundle } from '../common/satusehat/satusehat.types';
import { SatusehatEncounterIdResult } from './satusehat-encounter-id-backfill.types';

/**
 * Decides what one legacy row resolves to, given the search bundle the
 * platform returned for its encounter identifier. Kept separate from the
 * script that performs the search so the branching is testable without a
 * network or a database.
 *
 * Exactly one hit is the only case that writes. Zero means the row may have
 * been submitted under a different organisation id in an earlier sandbox, and
 * more than one means the platform holds duplicates — neither has a single
 * right answer a script gets to pick, so both are listed for a human.
 *
 * Counted from the returned entries rather than `Bundle.total`: this search is
 * by a unique org-scoped identifier, so a result that needs paging is already
 * the ambiguous case, and an entry present but unusable (no resource id) is
 * treated as ambiguous too rather than silently as a miss.
 */
export function resolveSatusehatEncounterId(input: {
  submissionId: string;
  encounterId: string;
  bundle: SatusehatSearchBundle;
}): SatusehatEncounterIdResult {
  const entries = input.bundle.entry ?? [];
  if (entries.length === 0) {
    return {
      submissionId: input.submissionId,
      encounterId: input.encounterId,
      outcome: 'NOT_FOUND',
      satusehatEncounterId: null,
    };
  }
  const resourceId = entries[0]?.resource?.id;
  if (entries.length > 1 || typeof resourceId !== 'string' || resourceId === '') {
    return {
      submissionId: input.submissionId,
      encounterId: input.encounterId,
      outcome: 'AMBIGUOUS',
      satusehatEncounterId: null,
    };
  }
  return {
    submissionId: input.submissionId,
    encounterId: input.encounterId,
    outcome: 'FILLED',
    satusehatEncounterId: resourceId,
  };
}
