/**
 * Strips what people type between NPWP digits — dots, dashes and spaces — so
 * `01.234.567.8-901.000` and `012345678901000` compare equal. It validates
 * nothing; callers decide what a digit count means.
 */
export function normalizeNpwp(value: string): string {
  return value.replace(/[\s.-]/g, '');
}
