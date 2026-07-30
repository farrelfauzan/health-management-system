import type { EncounterStatusValue } from '@hms/shared-types';

export type EncounterTransitionTarget = Extract<EncounterStatusValue, 'FINISHED' | 'CANCELLED'>;

export type EncounterTransitionMeta = {
  icon: string;
  isDestructive: boolean;
};

/**
 * Both transitions are terminal — a medical record is corrected by superseding
 * it, never by re-opening it — so the copy says out loud what the confirmation
 * costs. Closing also completes the registration and releases the visit to the
 * SATUSEHAT and BPJS outboxes; cancelling retracts a record opened in error.
 */
export const ENCOUNTER_TRANSITION_META: Record<EncounterTransitionTarget, EncounterTransitionMeta> =
  {
    FINISHED: {
      icon: 'task_alt',
      isDestructive: false,
    },
    CANCELLED: {
      icon: 'cancel',
      isDestructive: true,
    },
  };
