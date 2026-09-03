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
  | 'rooms'
  | 'admissions'
  | 'pharmacy'
  | 'billing'
  | 'advanced'
  | 'aiAssistant'
  | 'aiProviders'
  | 'knowledgeBase'
  | 'myDocuments'
  | 'clinicCorpus'
  | 'conversations'
  | 'integrations'
  | 'organization'
  | 'administration'
  | 'today';

/**
 * Which live count, if any, a nav entry carries. Kept as a key rather than a
 * number because this table is static data read on the server, while every
 * count it can name is client state.
 */
export type ShellNavBadgeKey = 'aiAssistantUnread' | 'conversationHandoff';

export type AdminNavItem = {
  href: string;
  label: string;
  labelKey: ShellNavigationKey;
  icon: string;
  ability: AdminNavAbility | AdminNavAbility[] | null;
  badgeKey?: ShellNavBadgeKey;
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
        // IMP-16. Inventory and the occupancy board. Any of the three
        // inventory subjects is enough to open the screen — the workspace
        // renders only the tabs the ability allows, and a clinic that lets a
        // clerk read beds without reading wards still needs a way in.
        href: '/admin/rooms',
        label: 'Rooms',
        labelKey: 'rooms',
        // `meeting_room`, not a bed glyph: Admissions below is `bed`, and two
        // near-identical bed icons made the pair indistinguishable at sidebar
        // size. A door is the floor plan; the bed is the patient in it.
        icon: 'meeting_room',
        ability: [
          { action: 'read', subject: 'RoomClass' },
          { action: 'read', subject: 'Ward' },
          { action: 'read', subject: 'Room' },
          { action: 'read', subject: 'Bed' },
        ],
      },
      {
        href: '/admin/admissions',
        label: 'Admissions',
        labelKey: 'admissions',
        icon: 'bed',
        ability: { action: 'read', subject: 'Admission' },
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
          { action: 'read', subject: 'DocumentTemplate' },
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
        badgeKey: 'aiAssistantUnread',
      },
      {
        // Deliberately one entry away from the knowledge base below. That
        // corpus is chunked and its passages are sent to an AI provider; this
        // drawer is stored, served to its owner, and reaches no vendor at all
        // (FR-E3-06).
        href: '/admin/vault',
        label: 'My Documents',
        labelKey: 'myDocuments',
        icon: 'folder_shared',
        ability: { action: 'read', subject: 'VaultDocument' },
      },
      {
        href: '/admin/knowledge-base',
        label: 'Knowledge Base',
        labelKey: 'knowledgeBase',
        icon: 'library_books',
        ability: { action: 'read', subject: 'Document' },
      },
      {
        // The shared, patient-reachable corpus. Sits next to the personal
        // knowledge base above and carries the same ability, because the
        // frontend cannot tell the `:any` grant from the `:own` one — the
        // API does, on every route.
        href: '/admin/clinic-corpus',
        label: 'Clinic Corpus',
        labelKey: 'clinicCorpus',
        icon: 'menu_book',
        ability: { action: 'read', subject: 'Document' },
      },
      {
        // The WhatsApp/Telegram inbox. It carries the badge because this is
        // the one screen in the app whose work arrives from outside it: a
        // customer waiting for a person generates no other signal, and a queue
        // nobody is told about is a queue that gets checked at the end of the
        // shift.
        href: '/admin/conversations',
        label: 'Conversations',
        labelKey: 'conversations',
        icon: 'forum',
        ability: { action: 'read', subject: 'Conversation' },
        badgeKey: 'conversationHandoff',
      },
      {
        href: '/admin/ai-providers',
        label: 'AI Providers',
        labelKey: 'aiProviders',
        icon: 'settings_input_component',
        ability: { action: 'read', subject: 'AiProviderConfig' },
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
        // SJ-1. Gated on `read` alone, not `manage`: an account that may see
        // the chart but not redraw it still needs the way in, and the page
        // renders read-only for it.
        href: '/admin/organization',
        label: 'Organization',
        labelKey: 'organization',
        icon: 'account_tree',
        ability: { action: 'read', subject: 'OrganizationUnit' },
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
