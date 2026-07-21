import { APPOINTMENT_STATUSES, type AppointmentStatusValue } from '@hms/shared-types';

export type AppointmentStatusMeta = {
  label: string;
  dotClassName: string;
  blockClassName: string;
};

export const APPOINTMENT_STATUS_META: Record<AppointmentStatusValue, AppointmentStatusMeta> = {
  SCHEDULED: {
    label: 'Scheduled',
    dotClassName: 'bg-primary',
    blockClassName: 'border-primary bg-info-tint text-primary',
  },
  CONFIRMED: {
    label: 'Confirmed',
    dotClassName: 'bg-on-secondary-container',
    blockClassName:
      'border-on-secondary-container bg-secondary-container/25 text-on-secondary-container',
  },
  COMPLETED: {
    label: 'Completed',
    dotClassName: 'bg-neutral',
    blockClassName: 'border-neutral bg-neutral-tint text-neutral',
  },
  CANCELLED: {
    label: 'Cancelled',
    dotClassName: 'bg-danger',
    blockClassName: 'border-danger bg-danger-tint text-danger',
  },
  NO_SHOW: {
    label: 'No-Show',
    dotClassName: 'bg-warning',
    blockClassName: 'border-warning bg-warning-tint text-warning',
  },
};

export const APPOINTMENT_STATUS_LEGEND: AppointmentStatusValue[] = [...APPOINTMENT_STATUSES];
