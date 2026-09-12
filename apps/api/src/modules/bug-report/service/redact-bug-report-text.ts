import { detectSensitiveData, DetectSensitiveDataOptions } from '@hms/shared-types';

/**
 * The longest a redacted field may be when it goes to the triage vendor.
 *
 * A cap on the payload, not on the reporter: intake already bounds every field
 * (`schemas.ts`), so reaching this means a report near the maximum on several
 * fields at once. Truncating here keeps one verbose report from becoming a
 * disproportionately large completion request, and the marker below means
 * nobody reads a truncated field as a complete one.
 */
const MAX_REDACTED_FIELD_LENGTH = 2000;

const TRUNCATION_MARKER = ' […truncated]';

/**
 * Replaces every sensitive-data finding with a category marker, then caps the
 * length (P23-T09).
 *
 * This is the third of the four layers in `docs/security/ai-vendor-dpa.md` §5c,
 * and the last one that runs before the text leaves the building. It exists
 * even though intake already refused reports containing these shapes
 * (P23-T08), for two reasons that both amount to not trusting an earlier
 * decision: intake's MRN rule depends on runtime configuration that may have
 * changed since the row was stored, and a row written before a detector rule
 * was added would otherwise sail through on the strength of having once passed.
 * Re-running the detector on stored text costs microseconds and removes the
 * assumption entirely.
 *
 * Replacement runs **right to left**. Findings carry offsets into the original
 * string, so editing left to right would shift every later offset by the
 * difference between the match and its marker — silently corrupting the second
 * finding onward, which is exactly the sort of bug that leaves half a NIK in
 * place and still looks like it worked.
 */
export function redactBugReportText(
  text: string,
  options: DetectSensitiveDataOptions = {},
): string {
  const findings = [...detectSensitiveData(text, options)].sort((left, right) => right.start - left.start);
  const redacted = findings.reduce(
    (current, finding) =>
      `${current.slice(0, finding.start)}[REDACTED:${finding.category}]${current.slice(finding.end)}`,
    text,
  );
  return capLength(redacted);
}

/**
 * Truncates on a marker rather than mid-word silence, so a triager reading the
 * ticket knows the reporter wrote more than the model was shown.
 */
function capLength(text: string): string {
  if (text.length <= MAX_REDACTED_FIELD_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_REDACTED_FIELD_LENGTH - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}
