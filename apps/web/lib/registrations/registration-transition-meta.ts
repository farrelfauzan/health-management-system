import type { RegistrationStatusValue } from '@hms/shared-types';

export type RegistrationTransitionTarget = Exclude<RegistrationStatusValue, 'PENDING'>;

export type RegistrationTransitionMeta = {
  actionLabel: string;
  icon: string;
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  isDestructive: boolean;
};

export const REGISTRATION_TRANSITION_META: Record<
  RegistrationTransitionTarget,
  RegistrationTransitionMeta
> = {
  CHECKED_IN: {
    actionLabel: 'Check In',
    icon: 'how_to_reg',
    title: 'Check In Patient',
    confirmLabel: 'Confirm Check-In',
    pendingLabel: 'Checking in…',
    isDestructive: false,
  },
  COMPLETED: {
    actionLabel: 'Complete',
    icon: 'task_alt',
    title: 'Complete Registration',
    confirmLabel: 'Confirm Completion',
    pendingLabel: 'Completing…',
    isDestructive: false,
  },
  CANCELLED: {
    actionLabel: 'Cancel Registration',
    icon: 'event_busy',
    title: 'Cancel Registration',
    confirmLabel: 'Cancel Registration',
    pendingLabel: 'Cancelling…',
    isDestructive: true,
  },
};
