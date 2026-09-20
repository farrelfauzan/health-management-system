/**
 * An empty numeric input means "not measured", which the API stores as null —
 * not as zero. `Number('')` is 0, so the emptiness has to be tested before the
 * conversion rather than after it.
 */
export function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}
