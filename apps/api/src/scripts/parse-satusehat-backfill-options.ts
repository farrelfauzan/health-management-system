import { SatusehatEncounterIdBackfillOptions } from './satusehat-encounter-id-backfill.types';

const DRY_RUN_FLAG = '--dry-run';
const ORGANIZATION_ID_FLAG = '--org-id=';

/**
 * Parses the two flags the `P10-T14` backfill takes.
 *
 * `--org-id` is mandatory and checked against `SATUSEHAT_ORGANIZATION_ID` by
 * the caller: identifier searches are scoped by organisation, so running with
 * one deployment's credentials against another's rows would silently find
 * nothing and mark every row NOT_FOUND. Requiring the operator to type the id
 * they think they are working on turns that into a refusal instead of a
 * misleading report.
 */
export function parseSatusehatBackfillOptions(
  argv: readonly string[],
): SatusehatEncounterIdBackfillOptions {
  const organizationIdArgument = argv.find((argument) => argument.startsWith(ORGANIZATION_ID_FLAG));
  return {
    isDryRun: argv.includes(DRY_RUN_FLAG),
    organizationId: organizationIdArgument
      ? (organizationIdArgument.slice(ORGANIZATION_ID_FLAG.length) || null)
      : null,
  };
}
