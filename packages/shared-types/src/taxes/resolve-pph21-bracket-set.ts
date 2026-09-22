import type {
  Pph21BracketSet,
  Pph21TaxBracketRecord,
  ResolvePph21BracketSetParams,
} from '#taxes/types';

/**
 * The Pasal 17(1)(a) bracket set in force on a date (P27-T07). Rows sharing
 * an `effectiveFrom` are one set; the set that applies is the latest one
 * starting on or before the date, so a set dated in the future is ignored
 * for an earlier period. Brackets come back lowest bound first.
 */
export function resolvePph21BracketSet(params: ResolvePph21BracketSetParams): Pph21BracketSet {
  const started = params.brackets.filter((bracket) => bracket.effectiveFrom <= params.onDate);
  if (started.length === 0) {
    return { effectiveFrom: null, brackets: [] };
  }
  const effectiveFrom = started
    .map((bracket) => bracket.effectiveFrom)
    .reduce((latest, candidate) => (candidate > latest ? candidate : latest));
  const brackets: Pph21TaxBracketRecord[] = started
    .filter((bracket) => bracket.effectiveFrom === effectiveFrom)
    .sort((left, right) => left.lowerBound - right.lowerBound);
  return { effectiveFrom, brackets };
}
