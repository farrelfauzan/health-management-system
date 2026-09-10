/**
 * Reads the `degrees` column back into the ordered list it was written from.
 *
 * The column stays a single string rather than becoming a join table: a
 * doctor's degrees are printed as one ordered phrase and never queried
 * individually, and a comma is safe as the separator because
 * `doctorCredentialCodeSchema` forbids one inside a code. Legacy rows hold a
 * free-text phrase with no comma in it, which comes back as a single entry —
 * exactly the value the resolver then flags as legacy.
 */
export function splitDegreeCodes(stored: string | null | undefined): string[] {
  if (!stored) {
    return [];
  }
  return stored
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
