import type { AdminNavSection } from '#lib/shell/nav-items';

/**
 * The doctor shell is deliberately narrow: a clinician's job in this app is
 * the visit in front of them, and every OWN-scoped grant they hold is about
 * their own encounters, schedule, and patients. Anything requiring an ANY
 * grant lives in the admin shell and is not linked from here.
 */
export const DOCTOR_NAV_SECTIONS: AdminNavSection[] = [
  {
    label: null,
    items: [
      { href: '/doctor/dashboard', label: 'Today', icon: 'dashboard', ability: null },
      {
        href: '/doctor/encounters',
        label: 'Encounters',
        icon: 'clinical_notes',
        ability: { action: 'read', subject: 'Encounter' },
      },
      {
        href: '/doctor/appointments',
        label: 'Appointments',
        icon: 'event',
        ability: { action: 'read', subject: 'Appointment' },
      },
    ],
  },
];
