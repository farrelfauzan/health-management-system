export type DoctorDisplayNameInput = {
  /** The title's printed label ("dr."), already resolved — never a code. */
  title?: string | null;
  fullName: string;
  /** Each degree's printed label ("Sp.PD"), in the order it should print. */
  degrees?: readonly string[];
};

/**
 * The one way a doctor's name is written out: `dr. Andi Prasetyo, Sp.PD`
 * (P19-T14).
 *
 * Pure and label-only on purpose. Resolving a code to its printed form is the
 * API's job and needs the catalog; deciding where the comma goes is a
 * formatting rule that must be identical on a document, an invoice and a
 * screen, so it lives in one function both sides import.
 *
 * `fullName` frequently already carries the honorifics on rows typed in before
 * this existed ("dr. Andi Prasetyo, Sp.PD"), so a title or degree the name
 * already ends or begins with is not repeated.
 */
export function buildDoctorDisplayName({
  title,
  fullName,
  degrees = [],
}: DoctorDisplayNameInput): string {
  const trimmedName = fullName.trim();
  const trimmedTitle = title?.trim() ?? '';
  const lowerName = trimmedName.toLowerCase();
  const prefix =
    trimmedTitle.length > 0 && !lowerName.startsWith(`${trimmedTitle.toLowerCase()} `)
      ? `${trimmedTitle} `
      : '';
  const suffixes = degrees
    .map((degree) => degree.trim())
    .filter(
      (degree) => degree.length > 0 && !lowerName.endsWith(`, ${degree.toLowerCase()}`),
    );
  const suffix = suffixes.length > 0 ? `, ${suffixes.join(', ')}` : '';
  return `${prefix}${trimmedName}${suffix}`;
}
