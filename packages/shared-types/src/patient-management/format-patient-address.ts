/**
 * The pieces of a patient address the formatter can print (P19-T10). Every
 * field is optional: a legacy row carries only the street line, a chat-made
 * draft may carry nothing at all.
 */
export type FormatPatientAddressInput = {
  address?: string | null;
  rtRw?: string | null;
  villageName?: string | null;
  districtName?: string | null;
  regencyName?: string | null;
  provinceName?: string | null;
  postalCode?: string | null;
};

const PART_SEPARATOR = ', ';

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * One printable line — street, RT/RW, village, district, regency, province,
 * postal code — for tables, PDFs and documents. Anything missing is simply
 * left out, so a legacy row prints its street line exactly as before and a
 * row with nothing prints an empty string rather than a row of commas.
 */
export function formatPatientAddress(input: FormatPatientAddressInput): string {
  const parts: string[] = [];
  if (hasText(input.address)) {
    parts.push(input.address.trim());
  }
  if (hasText(input.rtRw)) {
    parts.push(`RT/RW ${input.rtRw.trim()}`);
  }
  for (const name of [
    input.villageName,
    input.districtName,
    input.regencyName,
    input.provinceName,
  ]) {
    if (hasText(name)) {
      parts.push(name.trim());
    }
  }
  if (hasText(input.postalCode)) {
    parts.push(input.postalCode.trim());
  }
  return parts.join(PART_SEPARATOR);
}
