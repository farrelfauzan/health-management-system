import type { AppAction, AppSubject } from '@hms/ui';

export type AdminNavAbility = {
  action: AppAction;
  subject: AppSubject;
};

export type ShellNavigationKey =
  | 'dashboard'
  | 'patients'
  | 'doctors'
  | 'appointments'
  | 'registration'
  | 'encounters'
  | 'pharmacy'
  | 'billing'
  | 'advanced'
  | 'aiAssistant'
  | 'integrations'
  | 'administration'
  | 'today';

export type AdminNavItem = {
  href: string;
  label: string;
  labelKey: ShellNavigationKey;
  icon: string;
  ability: AdminNavAbility | AdminNavAbility[] | null;
};

export type AdminNavSection = {
  label: string | null;
  labelKey?: ShellNavigationKey;
  items: AdminNavItem[];
};

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    label: null,
    items: [
      {
        href: '/admin/dashboard',
        label: 'Dashboard',
        labelKey: 'dashboard',
        icon: 'dashboard',
        ability: null,
      },
      {
        href: '/admin/patients',
        label: 'Patients',
        labelKey: 'patients',
        icon: 'group',
        ability: { action: 'read', subject: 'Patient' },
      },
      {
        href: '/admin/doctors',
        label: 'Doctors',
        labelKey: 'doctors',
        icon: 'medical_services',
        ability: { action: 'read', subject: 'Doctor' },
      },
      {
        href: '/admin/appointments',
        label: 'Appointments',
        labelKey: 'appointments',
        icon: 'event',
        ability: { action: 'read', subject: 'Appointment' },
      },
      {
        href: '/admin/registrations',
        label: 'Registration',
        labelKey: 'registration',
        icon: 'person_add',
        ability: { action: 'read', subject: 'Registration' },
      },
      {
        href: '/admin/encounters',
        label: 'Encounters',
        labelKey: 'encounters',
        icon: 'clinical_notes',
        ability: { action: 'read', subject: 'Encounter' },
      },
      {
        href: '/admin/pharmacy',
        label: 'Pharmacy',
        labelKey: 'pharmacy',
        icon: 'local_pharmacy',
        ability: { action: 'read', subject: 'Medication' },
      },
      {
        href: '/admin/billing',
        label: 'Billing',
        labelKey: 'billing',
        icon: 'receipt_long',
        ability: [
          { action: 'read', subject: 'Invoice' },
          { action: 'read', subject: 'ServiceTariff' },
        ],
      },
    ],
  },
  {
    label: 'Advanced',
    labelKey: 'advanced',
    items: [
      {
        href: '/admin/ai-assistant',
        label: 'AI Assistant',
        labelKey: 'aiAssistant',
        icon: 'psychology',
        ability: { action: 'create', subject: 'ChatSession' },
      },
      {
        href: '/admin/integrations',
        label: 'Integrations',
        labelKey: 'integrations',
        icon: 'hub',
        ability: [
          { action: 'read', subject: 'BpjsSubmission' },
          { action: 'read', subject: 'SatusehatSubmission' },
          { action: 'manage', subject: 'BpjsConfig' },
          { action: 'manage', subject: 'BpjsMapping' },
        ],
      },
      {
        href: '/admin/administration',
        label: 'Administration',
        labelKey: 'administration',
        icon: 'settings',
        ability: { action: 'read', subject: 'User' },
      },
    ],
  },
];
