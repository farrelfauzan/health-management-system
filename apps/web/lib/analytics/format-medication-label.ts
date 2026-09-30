/** A medication as the pharmacy shelf names it: "Amoksisilin 500 mg". */
export function formatMedicationLabel(name: string, strength: string | null | undefined): string {
  return strength ? `${name} ${strength}` : name;
}
