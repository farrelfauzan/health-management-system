/**
 * Writes an ordered list of DEGREE codes into the single `degrees` column.
 * Order is the doctor's own — a specialist credential precedes an academic one
 * on an Indonesian signature block — so the list is stored exactly as given and
 * never sorted. An empty list clears the column.
 */
export function joinDegreeCodes(codes: readonly string[]): string | null {
  const trimmed = codes.map((code) => code.trim()).filter((code) => code.length > 0);
  return trimmed.length > 0 ? trimmed.join(',') : null;
}
