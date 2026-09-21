/**
 * Whether a heel prick was taken before its window opened (P25-T10). A sample
 * under 48 hours is read poorly by the laboratory, so it is allowed — the
 * midwife may know something the window does not — but never silent.
 */
export function isShkSampleEarly(input: { sampleTakenAt: Date | null; dueFrom: Date }): boolean {
  return input.sampleTakenAt !== null && input.sampleTakenAt.getTime() < input.dueFrom.getTime();
}
