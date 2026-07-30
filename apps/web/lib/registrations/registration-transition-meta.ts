import type { RegistrationStatusValue } from '@hms/shared-types';

export type RegistrationTransitionTarget = Exclude<RegistrationStatusValue, 'PENDING'>;

export type RegistrationTransitionMeta = {
  icon: string;
  isDestructive: boolean;
};

export const REGISTRATION_TRANSITION_META: Record<
  RegistrationTransitionTarget,
  RegistrationTransitionMeta
> = {
  CHECKED_IN: {
    icon: 'how_to_reg',
    isDestructive: false,
  },
  COMPLETED: {
    icon: 'task_alt',
    isDestructive: false,
  },
  CANCELLED: {
    icon: 'event_busy',
    isDestructive: true,
  },
};
