import type { EncounterStatusValue } from '@hms/shared-types';

export type EncounterTransitionTarget = Extract<EncounterStatusValue, 'FINISHED' | 'CANCELLED'>;

export type EncounterTransitionMeta = {
  actionLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
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
      actionLabel: 'Close Encounter',
      title: 'Close this encounter?',
      description:
        'The clinical record is signed off and its registration is completed. Closed encounters cannot be re-opened or edited — a correction is recorded as a new encounter.',
      confirmLabel: 'Close Encounter',
      pendingLabel: 'Closing...',
      icon: 'task_alt',
      isDestructive: false,
    },
    CANCELLED: {
      actionLabel: 'Cancel Encounter',
      title: 'Cancel this encounter?',
      description:
        'Use this only for an encounter opened in error. The record is retracted with its registration and stays auditable; the patient re-registers to be seen.',
      confirmLabel: 'Cancel Encounter',
      pendingLabel: 'Cancelling...',
      icon: 'cancel',
      isDestructive: true,
    },
  };
