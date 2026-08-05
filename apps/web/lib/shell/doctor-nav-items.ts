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
      {
        href: '/doctor/dashboard',
        label: 'Today',
        labelKey: 'today',
        icon: 'dashboard',
        ability: null,
      },
      {
        href: '/doctor/encounters',
        label: 'Encounters',
        labelKey: 'encounters',
        icon: 'clinical_notes',
        ability: { action: 'read', subject: 'Encounter' },
      },
      {
        href: '/doctor/appointments',
        label: 'Appointments',
        labelKey: 'appointments',
        icon: 'event',
        ability: { action: 'read', subject: 'Appointment' },
      },
      {
        // `patient.read:own` — the API returns only patients actively
        // assigned to this doctor, so this is their panel, not a directory.
        href: '/doctor/patients',
        label: 'Patients',
        labelKey: 'patients',
        icon: 'group',
        ability: { action: 'read', subject: 'Patient' },
      },
      {
        // The assistant is an OWN-scoped grant every doctor holds, so it
        // belongs in this shell. It was previously reachable only through the
        // floating launcher, and that pointed at the admin route.
        href: '/doctor/ai-assistant',
        label: 'AI Assistant',
        labelKey: 'aiAssistant',
        icon: 'psychology',
        ability: { action: 'create', subject: 'ChatSession' },
        badgeKey: 'aiAssistantUnread',
      },
      {
        // Sits beside the assistant because that is what it feeds: documents
        // here are retrieved only in this doctor's own sessions.
        href: '/doctor/knowledge-base',
        label: 'Knowledge Base',
        labelKey: 'knowledgeBase',
        icon: 'library_books',
        ability: { action: 'read', subject: 'Document' },
      },
    ],
  },
];
