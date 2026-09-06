import type { EncounterPrognosisValue } from '@hms/shared-types';

/**
 * The prognosis terms in the order a clinician reads them — best to worst —
 * rather than the alphabetical order the enum happens to declare.
 */
export const ENCOUNTER_PROGNOSIS_OPTIONS: readonly EncounterPrognosisValue[] = [
  'BONAM',
  'DUBIA_AD_BONAM',
  'DUBIA_AD_MALAM',
  'MALAM',
] as const;
