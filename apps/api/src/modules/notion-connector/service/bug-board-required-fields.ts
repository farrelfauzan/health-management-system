import { NotionBugBoardFieldRequirement } from '@hms/shared-types';

/**
 * Every property the bug publisher writes, and what the Bug Board has to
 * offer for the write to land (P23-T04).
 *
 * This list is the board's contract, restated where a test can reach it.
 * Renaming a column in Notion is a two-second act with no warning attached;
 * without this check the first anyone hears of it is a stream of
 * `400 validation_error` in the worker, hours later, naming nothing.
 *
 * Select options are enumerated only where HMS writes a fixed value. Notion
 * rejects a page whose select option does not exist, so a missing option is a
 * publish failure — but an option nobody writes is the board owner's business,
 * not this check's, which is why `Status` lists only the two states the
 * publisher sets and not the four a human moves a ticket through.
 *
 * `Assignee`, `Dev Ticket` and `Created` are deliberately absent: they belong
 * to people and to Notion, and HMS never writes them.
 */
export const BUG_BOARD_REQUIRED_FIELDS: readonly NotionBugBoardFieldRequirement[] = [
  { field: 'Title', type: 'title' },
  { field: 'Report ID', type: 'rich_text' },
  { field: 'Clinic', type: 'rich_text' },
  { field: 'Page', type: 'rich_text' },
  { field: 'Request IDs', type: 'rich_text' },
  { field: 'App Version', type: 'rich_text' },
  { field: 'Status', type: 'select', options: ['New', 'Triaged'] },
  {
    field: 'Severity',
    type: 'select',
    options: ['P0 - Critical', 'P1 - High', 'P2 - Medium', 'P3 - Low'],
  },
  { field: 'Type', type: 'select', options: ['Bug', 'Feature Request', 'Question', 'Not a Bug'] },
  {
    field: 'Module',
    type: 'select',
    options: [
      'Authentication',
      'Patients',
      'Doctors',
      'Appointments',
      'Registration',
      'Pharmacy',
      'Billing',
      'Laboratory',
      'Documents',
      'Rooms & Inpatient',
      'AI Assistant',
      'Integrations',
      'Administration',
      'Notifications',
      'Other',
    ],
  },
  {
    field: 'Reporter Role',
    type: 'select',
    options: ['Super Admin', 'Admin', 'Doctor', 'Pharmacist', 'Lab Technician'],
  },
  { field: 'Triaged By', type: 'select', options: ['AI', 'Fallback'] },
  { field: 'Reported At', type: 'date' },
];
