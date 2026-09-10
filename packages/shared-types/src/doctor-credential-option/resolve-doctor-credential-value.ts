import type { DoctorCredentialValue } from '#doctor-credential-option/contracts';

type ResolvableOption = {
  code: string;
  label: string;
};

/**
 * Turns one stored credential into the value the API hands out (P19-T14).
 *
 * Code first, then a case-insensitive label match, because rows written before
 * the catalog existed hold the printed form itself ("Sp.PD") rather than a code
 * — matching on the label recovers most of them without a data migration that
 * would have to guess. Whatever matches neither comes back verbatim and
 * flagged, so it still prints correctly and the form can ask for a pick.
 */
export function resolveDoctorCredentialValue(
  stored: string,
  options: readonly ResolvableOption[],
): DoctorCredentialValue {
  const trimmed = stored.trim();
  const byCode = options.find((option) => option.code === trimmed);
  if (byCode) {
    return { code: byCode.code, label: byCode.label, isLegacy: false };
  }
  const lowered = trimmed.toLowerCase();
  const byLabel = options.find((option) => option.label.toLowerCase() === lowered);
  if (byLabel) {
    return { code: byLabel.code, label: byLabel.label, isLegacy: false };
  }
  return { label: trimmed, isLegacy: true };
}
