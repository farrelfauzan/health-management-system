import type { AppAction, AppSubject } from '@hms/ui';

export type AdminNavAbility = {
  action: AppAction;
  subject: AppSubject;
};

export type AdminNavItem = {
  href: string;
  label: string;
  icon: string;
  ability: AdminNavAbility | AdminNavAbility[] | null;
};

export type AdminNavSection = {
  label: string | null;
  items: AdminNavItem[];
};

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    label: null,
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard', ability: null },
      {
        href: '/admin/patients',
        label: 'Patients',
        icon: 'group',
        ability: { action: 'read', subject: 'Patient' },
      },
      {
        href: '/admin/doctors',
        label: 'Doctors',
        icon: 'medical_services',
        ability: { action: 'read', subject: 'Doctor' },
      },
      {
        href: '/admin/appointments',
        label: 'Appointments',
        icon: 'event',
        ability: { action: 'read', subject: 'Appointment' },
      },
      {
        href: '/admin/registrations',
        label: 'Registration',
        icon: 'person_add',
        ability: { action: 'read', subject: 'Registration' },
      },
      {
        href: '/admin/encounters',
        label: 'Encounters',
        icon: 'clinical_notes',
        ability: { action: 'read', subject: 'Encounter' },
      },
      {
        href: '/admin/pharmacy',
        label: 'Pharmacy',
        icon: 'local_pharmacy',
        ability: { action: 'read', subject: 'Medication' },
      },
    ],
  },
  {
    label: 'Advanced',
    items: [
      {
        href: '/admin/ai-assistant',
        label: 'AI Assistant',
        icon: 'psychology',
        ability: { action: 'create', subject: 'ChatSession' },
      },
      {
        href: '/admin/integrations',
        label: 'Integrations',
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
        icon: 'settings',
        ability: { action: 'read', subject: 'User' },
      },
    ],
  },
];
