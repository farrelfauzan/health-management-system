import { FACILITY_CONFIG, FACILITY_KIND_LABELS } from '#lib/facility/facility-config';
import type { ShellNavigationKey } from '#lib/shell/nav-items';

export type AdminRouteKey =
  | 'dashboard'
  | 'patients'
  | 'doctors'
  | 'appointments'
  | 'registrations'
  | 'encounters'
  | 'pharmacy'
  | 'billing'
  | 'ai-assistant'
  | 'integrations'
  | 'administration';

export type AdminRouteMetadata = {
  breadcrumbs: string[];
  title: string;
  subtitle: string;
};

export type AdminRouteMessageKey =
  | 'mainDashboard'
  | 'overview'
  | 'clinicOverview'
  | 'hospitalOverview'
  | 'dashboardSubtitle'
  | 'patientDirectory'
  | 'patientsSubtitle'
  | 'doctorDirectory'
  | 'doctorsSubtitle'
  | 'appointmentScheduling'
  | 'appointmentsSubtitle'
  | 'registrationQueue'
  | 'registrationsSubtitle'
  | 'clinicalEncounters'
  | 'encountersSubtitle'
  | 'pharmacyQueue'
  | 'pharmacySubtitle'
  | 'billingCashier'
  | 'billingSubtitle'
  | 'aiClinicalAssistant'
  | 'aiAssistantSubtitle'
  | 'integrationsSubtitle'
  | 'administrationSubtitle';

type RouteTranslation = (key: AdminRouteMessageKey, values?: { facilityName: string }) => string;
type NavigationTranslation = (key: ShellNavigationKey) => string;

export function resolveLocalizedAdminRouteMetadata(
  routeKey: AdminRouteKey,
  translate: RouteTranslation,
  translateNavigation: NavigationTranslation,
): AdminRouteMetadata {
  const navigationKeys = {
    patients: 'patients',
    doctors: 'doctors',
    appointments: 'appointments',
    registrations: 'registration',
    encounters: 'encounters',
    pharmacy: 'pharmacy',
    billing: 'billing',
    'ai-assistant': 'aiAssistant',
    integrations: 'integrations',
    administration: 'administration',
  } as const;
  const descriptors: Record<
    Exclude<AdminRouteKey, 'dashboard'>,
    [AdminRouteMessageKey, AdminRouteMessageKey]
  > = {
    patients: ['patientDirectory', 'patientsSubtitle'],
    doctors: ['doctorDirectory', 'doctorsSubtitle'],
    appointments: ['appointmentScheduling', 'appointmentsSubtitle'],
    registrations: ['registrationQueue', 'registrationsSubtitle'],
    encounters: ['clinicalEncounters', 'encountersSubtitle'],
    pharmacy: ['pharmacyQueue', 'pharmacySubtitle'],
    billing: ['billingCashier', 'billingSubtitle'],
    'ai-assistant': ['aiClinicalAssistant', 'aiAssistantSubtitle'],
    integrations: ['integrationsSubtitle', 'integrationsSubtitle'],
    administration: ['administrationSubtitle', 'administrationSubtitle'],
  } as const;

  if (routeKey === 'dashboard') {
    return {
      breadcrumbs: [translate('mainDashboard'), translate('overview')],
      title: translate(FACILITY_CONFIG.kind === 'clinic' ? 'clinicOverview' : 'hospitalOverview'),
      subtitle: translate('dashboardSubtitle', { facilityName: FACILITY_CONFIG.name }),
    };
  }

  const [titleKey, subtitleKey] = descriptors[routeKey];
  const isAdvanced =
    routeKey === 'ai-assistant' || routeKey === 'integrations' || routeKey === 'administration';
  const title =
    routeKey === 'integrations' || routeKey === 'administration'
      ? translateNavigation(navigationKeys[routeKey])
      : translate(titleKey);
  return {
    breadcrumbs: [
      isAdvanced ? translateNavigation('advanced') : translate('mainDashboard'),
      translateNavigation(navigationKeys[routeKey]),
    ],
    title,
    subtitle: translate(subtitleKey),
  };
}

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
  encounters: {
    breadcrumbs: ['Main Dashboard', 'Encounters'],
    title: 'Clinical Encounters',
    subtitle: 'Open, record, and close the medical record for each visit.',
  },
  pharmacy: {
    breadcrumbs: ['Main Dashboard', 'Pharmacy'],
    title: 'Pharmacy Queue',
    subtitle: 'Verify and dispense incoming prescriptions.',
  },
  billing: {
    breadcrumbs: ['Main Dashboard', 'Billing'],
    title: 'Billing & Cashier',
    subtitle: 'Generate invoices from finished visits, settle them, and reconcile the drawer.',
  },
  'ai-assistant': {
    breadcrumbs: ['Advanced', 'AI Assistant'],
    title: 'AI Clinical Assistant',
    subtitle: 'Ask clinical questions grounded in Saling Jaga patient context.',
  },
  integrations: {
    breadcrumbs: ['Advanced', 'Integrations'],
    title: 'Integrations',
    subtitle: 'Configure BPJS PCare and monitor external health-data submissions.',
  },
  administration: {
    breadcrumbs: ['Advanced', 'Administration'],
    title: 'Administration',
    subtitle: 'Manage system users, roles, and permissions.',
  },
};
