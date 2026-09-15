import type { MidwifeFormularyPreviewItemResponse } from '@hms/shared-types';

/**
 * The medication ids the midwife formulary dialog pre-checks (P25-T04): rows
 * matched by KFA code or template that are not flagged yet. A keyword match
 * is only a suggestion and is never pre-checked, because the server refuses
 * it on apply.
 */
export function buildMidwifeFormularySelection(
  items: readonly MidwifeFormularyPreviewItemResponse[],
): Set<string> {
  return new Set(
    items.flatMap((entry) =>
      entry.matches
        .filter((match) => match.matchedBy !== 'KEYWORD' && !match.isMidwifePrescribable)
        .map((match) => match.medicationId),
    ),
  );
}
