import type { MidwifeFormularyPreviewItemResponse } from '@hms/shared-types';

/**
 * Every medication id `apply` would accept: matched by KFA code or template
 * under at least one item. A row suggested only by keyword is not in it.
 */
export function collectApplicableMidwifeFormularyIds(
  items: readonly MidwifeFormularyPreviewItemResponse[],
): Set<string> {
  return new Set(
    items.flatMap((entry) =>
      entry.matches
        .filter((match) => match.matchedBy !== 'KEYWORD')
        .map((match) => match.medicationId),
    ),
  );
}
