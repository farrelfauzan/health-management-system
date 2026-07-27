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
