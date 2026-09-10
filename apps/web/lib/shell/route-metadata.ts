import { FACILITY_CONFIG, FACILITY_KIND_LABELS } from '#lib/facility/facility-config';
import { BREADCRUMB_SHELL_ROOTS } from '#lib/navigation/breadcrumb-shell';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';
import { buildShellBreadcrumbRoot } from '#lib/navigation/build-shell-breadcrumb-root';
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
  breadcrumbs: BreadcrumbTrailItem[];
  title: string;
  subtitle: string;
};

export type AdminRouteMessageKey =
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

  const root = buildShellBreadcrumbRoot({ shell: 'admin', translateNavigation });

  if (routeKey === 'dashboard') {
    return {
      breadcrumbs: [root, { label: translate('overview') }],
      title: translate(FACILITY_CONFIG.kind === 'clinic' ? 'clinicOverview' : 'hospitalOverview'),
      subtitle: translate('dashboardSubtitle', { facilityName: FACILITY_CONFIG.name }),
    };
  }

  const [titleKey, subtitleKey] = descriptors[routeKey];
  const title =
    routeKey === 'integrations' || routeKey === 'administration'
      ? translateNavigation(navigationKeys[routeKey])
      : translate(titleKey);
  return {
    breadcrumbs: [root, { label: translateNavigation(navigationKeys[routeKey]) }],
    title,
    subtitle: translate(subtitleKey),
  };
}

const ADMIN_ROOT_BREADCRUMB: BreadcrumbTrailItem = {
  label: 'Dashboard',
  href: BREADCRUMB_SHELL_ROOTS.admin.href,
};

export const ADMIN_ROUTE_METADATA: Record<AdminRouteKey, AdminRouteMetadata> = {
  dashboard: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Overview' }],
    title: `${FACILITY_KIND_LABELS[FACILITY_CONFIG.kind]} Overview`,
    subtitle: `Key metrics and activity across ${FACILITY_CONFIG.name} today.`,
  },
  patients: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Patients' }],
    title: 'Patient Directory',
    subtitle: 'Manage and monitor current and past patient records across all departments.',
  },
  doctors: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Doctors' }],
    title: 'Doctor Directory',
    subtitle: 'Manage doctor profiles, specialties, and weekly schedules.',
  },
  appointments: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Appointments' }],
    title: 'Appointment Scheduling',
    subtitle: 'Coordinate visits across doctors and time slots.',
  },
  registrations: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Registration' }],
    title: 'Registration Queue',
    subtitle: 'Track patient registrations from check-in to completion.',
  },
  encounters: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Encounters' }],
    title: 'Clinical Encounters',
    subtitle: 'Open, record, and close the medical record for each visit.',
  },
  pharmacy: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Pharmacy' }],
    title: 'Pharmacy Queue',
    subtitle: 'Verify and dispense incoming prescriptions.',
  },
  billing: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Billing' }],
    title: 'Billing & Cashier',
    subtitle: 'Generate invoices from finished visits, settle them, and reconcile the drawer.',
  },
  'ai-assistant': {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'AI Assistant' }],
    title: 'AI Clinical Assistant',
    subtitle: 'Ask clinical questions grounded in Saling Jaga patient context.',
  },
  integrations: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Integrations' }],
    title: 'Integrations',
    subtitle: 'Configure BPJS PCare and monitor external health-data submissions.',
  },
  administration: {
    breadcrumbs: [ADMIN_ROOT_BREADCRUMB, { label: 'Administration' }],
    title: 'Administration',
    subtitle: 'Manage system users, roles, and permissions.',
  },
};
