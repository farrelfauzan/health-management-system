/**
 * A `YYYY-MM-DD` string as the midnight-UTC instant the date columns store.
 *
 * Parsed as UTC deliberately: `new Date('2026-02-02')` is already UTC
 * midnight, but `new Date(2026, 1, 2)` would be local midnight, and in
 * Asia/Jakarta that is the previous day in UTC — which is how an HPHT typed
 * at the counter turns into a gestational age a day out and, at a boundary, a
 * visit in the wrong trimester.
 */
export function toMaternalDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(`${value}T00:00:00.000Z`);
}
