/**
 * The catalogs are a type-ahead, not a browsable list: a single letter would
 * match thousands of codes, so the lookup waits for a term worth ranking.
 */
export const MIN_CODE_SEARCH_LENGTH = 2;

export const CODE_SEARCH_LIMIT = 20;
