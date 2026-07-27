import { z } from 'zod';

export const ENCOUNTER_STATUSES = ['IN_PROGRESS', 'FINISHED', 'CANCELLED'] as const;

export const encounterStatusSchema = z.enum(ENCOUNTER_STATUSES);

export type EncounterStatusValue = z.infer<typeof encounterStatusSchema>;

/**
 * Allowed encounter status transitions. Both closed states are terminal: a
 * medical record is corrected by superseding it, never by re-opening it, so a
 * FINISHED or CANCELLED encounter accepts no further transition.
 */
export const ENCOUNTER_STATUS_TRANSITIONS: Record<
  EncounterStatusValue,
  readonly EncounterStatusValue[]
> = {
  IN_PROGRESS: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
} as const;

/**
 * Inclusive plausibility bounds for each vital sign, in the unit fixed by its
 * column (cm, kg, mmHg, beats/min, breaths/min, °C, %).
 *
 * These reject physiologically impossible values only — a decimal typo turning
 * 36.8 °C into 368 — never merely abnormal ones, because a critical reading
 * must still be recordable. They mirror the CHECK constraints in migration
 * `20260728120000_vital_signs`; the request schema in P8-T05 derives its
 * ranges from this constant so the two cannot drift apart.
 */
export const VITAL_SIGNS_BOUNDS = {
  heightCm: { min: 0.01, max: 300 },
  weightKg: { min: 0.01, max: 700 },
  systolicBloodPressure: { min: 20, max: 400 },
  diastolicBloodPressure: { min: 10, max: 300 },
  pulseRate: { min: 0, max: 400 },
  respiratoryRate: { min: 0, max: 150 },
  temperatureCelsius: { min: 20, max: 46 },
  oxygenSaturation: { min: 0, max: 100 },
} as const;
