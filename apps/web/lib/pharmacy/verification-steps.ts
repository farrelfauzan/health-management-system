export type VerificationStep = {
  id: string;
  label?: string;
};

export const VERIFICATION_STEPS: readonly VerificationStep[] = [
  { id: 'identity' },
  { id: 'dosage' },
  { id: 'label' },
] as const;
