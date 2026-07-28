/**
 * Inclusive three-character category ranges for the 21 ICD-10 chapters, in
 * chapter order. Ranges compare lexicographically, which is exact for ICD-10
 * categories because every one is a letter followed by two digits.
 */
const ICD10_CHAPTER_RANGES: ReadonlyArray<{
  readonly chapter: string;
  readonly from: string;
  readonly to: string;
}> = [
  { chapter: 'I', from: 'A00', to: 'B99' },
  { chapter: 'II', from: 'C00', to: 'D48' },
  { chapter: 'III', from: 'D50', to: 'D89' },
  { chapter: 'IV', from: 'E00', to: 'E90' },
  { chapter: 'V', from: 'F00', to: 'F99' },
  { chapter: 'VI', from: 'G00', to: 'G99' },
  { chapter: 'VII', from: 'H00', to: 'H59' },
  { chapter: 'VIII', from: 'H60', to: 'H95' },
  { chapter: 'IX', from: 'I00', to: 'I99' },
  { chapter: 'X', from: 'J00', to: 'J99' },
  { chapter: 'XI', from: 'K00', to: 'K93' },
  { chapter: 'XII', from: 'L00', to: 'L99' },
  { chapter: 'XIII', from: 'M00', to: 'M99' },
  { chapter: 'XIV', from: 'N00', to: 'N99' },
  { chapter: 'XV', from: 'O00', to: 'O99' },
  { chapter: 'XVI', from: 'P00', to: 'P96' },
  { chapter: 'XVII', from: 'Q00', to: 'Q99' },
  { chapter: 'XVIII', from: 'R00', to: 'R99' },
  { chapter: 'XIX', from: 'S00', to: 'T98' },
  { chapter: 'XX', from: 'V01', to: 'Y98' },
  { chapter: 'XXI', from: 'Z00', to: 'Z99' },
];

/**
 * Derives the ICD-10 chapter (Roman numeral) that a code belongs to, or null
 * when the code falls outside every chapter range — U-codes, for instance, or a
 * malformed entry in an imported file.
 *
 * The seed in `apps/api/prisma/seed.sql` applies the identical mapping as a SQL
 * CASE. Keep the two in step.
 */
export function deriveIcd10Chapter(code: string): string | null {
  const category = code.trim().toUpperCase().split('.')[0] ?? '';
  const range = ICD10_CHAPTER_RANGES.find(
    (candidate) => category >= candidate.from && category <= candidate.to,
  );
  return range?.chapter ?? null;
}
