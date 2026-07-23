export type VerificationStep = {
  id: string;
  label: string;
};

export const VERIFICATION_STEPS: readonly VerificationStep[] = [
  { id: 'identity', label: 'Verify Patient Identity (ID Check)' },
  { id: 'dosage', label: 'Cross-check dosage calculation' },
  { id: 'label', label: 'Label printed & attached correctly' },
] as const;
