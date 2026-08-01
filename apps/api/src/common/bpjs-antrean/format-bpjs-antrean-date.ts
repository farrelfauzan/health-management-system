/**
 * Formats a date as Antrean Online's `yyyy-MM-dd` convention.
 *
 * Deliberately **not** `formatBpjsPcareDate`, which emits `dd-MM-yyyy`
 * (ADR D-022). The two BPJS services disagree on date format, and reusing the
 * PCare formatter here would send every `tanggalperiksa` transposed — a bug
 * that reads as correct in a diff and fails only at UAT. Which format Antrean
 * actually wants is part of spike question Q2; `yyyy-MM-dd` is what the
 * reference implementations send.
 *
 * Uses the UTC calendar parts for the same reason PCare's does: clinic-local
 * calendar days are stored as UTC-midnight dates (the `queueDate`
 * convention), so the UTC parts *are* the clinic-local day.
 */
export function formatBpjsAntreanDate(value: Date): string {
  const year = String(value.getUTCFullYear());
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
