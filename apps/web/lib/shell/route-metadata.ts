import { FACILITY_CONFIG, FACILITY_KIND_LABELS } from '#lib/facility/facility-config';

export type AdminRouteKey =
  | 'dashboard'
  | 'patients'
  | 'doctors'
  | 'appointments'
  | 'registrations'
  | 'pharmacy'
  | 'ai-assistant'
  | 'administration';

export type AdminRouteMetadata = {
  breadcrumbs: string[];
  title: string;
  subtitle: string;
};

export const ADMIN_ROUTE_METADATA: Record<AdminRouteKey, AdminRouteMetadata> = {
  dashboard: {
    breadcrumbs: ['Main Dashboard', 'Overview'],
    title: `${FACILITY_KIND_LABELS[FACILITY_CONFIG.kind]} Overview`,
    subtitle: `Key metrics and activity across ${FACILITY_CONFIG.name} today.`,
  },
  patients: {
    breadcrumbs: ['Main Dashboard', 'Patients'],
    title: 'Patient Directory',
    subtitle: 'Manage and monitor current and past patient records across all departments.',
  },
  doctors: {
    breadcrumbs: ['Main Dashboard', 'Doctors'],
    title: 'Doctor Directory',
    subtitle: 'Manage doctor profiles, specialties, and weekly schedules.',
  },
  appointments: {
    breadcrumbs: ['Main Dashboard', 'Appointments'],
    title: 'Appointment Scheduling',
    subtitle: 'Coordinate visits across doctors and time slots.',
  },
  registrations: {
    breadcrumbs: ['Main Dashboard', 'Registration'],
    title: 'Registration Queue',
    subtitle: 'Track patient registrations from check-in to completion.',
  },
  pharmacy: {
    breadcrumbs: ['Main Dashboard', 'Pharmacy'],
    title: 'Pharmacy Queue',
    subtitle: 'Verify and dispense incoming prescriptions.',
  },
  'ai-assistant': {
    breadcrumbs: ['Advanced', 'AI Assistant'],
    title: 'AI Clinical Assistant',
    subtitle: 'Ask clinical questions grounded in Saling Jaga patient context.',
  },
  administration: {
    breadcrumbs: ['Advanced', 'Administration'],
    title: 'Administration',
    subtitle: 'Manage system users, roles, and permissions.',
  },
};
