import {
  SatusehatEncounterIdBackfillSummary,
  SatusehatEncounterIdResult,
} from './satusehat-encounter-id-backfill.types';

/** Counts one run's outcomes, which is all the dry run ever prints. */
export function summariseSatusehatEncounterIdResults(
  results: readonly SatusehatEncounterIdResult[],
): SatusehatEncounterIdBackfillSummary {
  return {
    filled: results.filter((result) => result.outcome === 'FILLED').length,
    notFound: results.filter((result) => result.outcome === 'NOT_FOUND').length,
    ambiguous: results.filter((result) => result.outcome === 'AMBIGUOUS').length,
    encounterGone: results.filter((result) => result.outcome === 'ENCOUNTER_GONE').length,
  };
}
