type RawSearchParamValue = string | string[] | null | undefined;

/**
 * The one reading of a `?tab=`-style value (SJ-162), shared by the server
 * page that seeds the first paint and the client hook that follows the URL
 * afterwards, so both agree on what a string means. An absent, repeated or
 * unknown value is `undefined`; the caller decides the fallback, because only
 * the workspace knows which tabs this person may see.
 */
export function parseTabSearchParam<TTab extends string>(
  raw: RawSearchParamValue,
  allowed: readonly TTab[],
): TTab | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === null || value === undefined) {
    return undefined;
  }
  return allowed.find((tab) => tab === value);
}
