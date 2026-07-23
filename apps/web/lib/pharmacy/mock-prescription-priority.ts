// DUMMY-DATA: the prescription contract has no priority field, so every real row resolves to
// REGULAR and the STAT-Only queue filter matches nothing. Adding an optional priority
// (STAT | REGULAR) to the prescription schema is the documented API extension.
export type PrescriptionPriorityValue = 'STAT' | 'REGULAR';

export function resolvePrescriptionPriority(): PrescriptionPriorityValue {
  return 'REGULAR';
}
