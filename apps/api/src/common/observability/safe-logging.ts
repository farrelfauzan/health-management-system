export function stripQueryString(path: string): string {
  const queryIndex = path.indexOf('?');
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

export function buildSafeErrorLog(
  event: string,
  context: Readonly<Record<string, string | number | null | undefined>> = {},
): string {
  return JSON.stringify({ event, ...context });
}
