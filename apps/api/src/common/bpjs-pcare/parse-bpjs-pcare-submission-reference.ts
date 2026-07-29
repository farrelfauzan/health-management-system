/**
 * Extracts the reference number PCare returns for a created pendaftaran
 * (noUrut) or kunjungan (noKunjungan). The reference implementations
 * disagree on the envelope — a bare string, `{ message }`, `{ noUrut }`, or
 * `{ noKunjungan }` — so all four are accepted; anything else returns null
 * and the caller decides whether the flow can proceed without it.
 */
export function parseBpjsPcareSubmissionReference(response: unknown): string | null {
  if (typeof response === 'string' && response.trim().length > 0) {
    return response.trim();
  }
  if (typeof response !== 'object' || response === null) {
    return null;
  }
  const candidate = response as Record<string, unknown>;
  const fieldNames = ['noUrut', 'noKunjungan', 'message'] as const;
  for (const fieldName of fieldNames) {
    const value = candidate[fieldName];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}
