import type { AppRule } from './ability';

export const ADMIN_MANAGEMENT_ADMIN_RULES: AppRule[] = [
  { action: 'read', subject: 'User' },
  { action: 'create', subject: 'User' },
  { action: 'update', subject: 'User' },
  { action: 'read', subject: 'Role' },
];

export const ADMIN_MANAGEMENT_READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'User' }];

export const ADMIN_PORTAL_ADMIN_RULES: AppRule[] = [
  ...ADMIN_MANAGEMENT_ADMIN_RULES,
  { action: 'read', subject: 'Patient' },
  { action: 'create', subject: 'Patient' },
  { action: 'update', subject: 'Patient' },
  { action: 'read-identifier', subject: 'Patient' },
  { action: 'read-identifier', subject: 'Doctor' },
  { action: 'assign', subject: 'DoctorPatient' },
  { action: 'unassign', subject: 'DoctorPatient' },
  { action: 'read', subject: 'DoctorPatientActivity' },
  { action: 'read', subject: 'Doctor' },
  { action: 'create', subject: 'Doctor' },
  { action: 'update', subject: 'Doctor' },
  // P16-T19. Administrators only; the doctor and patient presets below
  // deliberately do not carry it.
  { action: 'read', subject: 'DoctorLicenseExpiry' },
  { action: 'write', subject: 'DoctorSchedule' },
  { action: 'read', subject: 'Appointment' },
  { action: 'create', subject: 'Appointment' },
  { action: 'update', subject: 'Appointment' },
  { action: 'cancel', subject: 'Appointment' },
  { action: 'approve', subject: 'Appointment' },
  { action: 'read', subject: 'AppointmentSession' },
  { action: 'update', subject: 'AppointmentSession' },
  { action: 'read', subject: 'Registration' },
  { action: 'create', subject: 'Registration' },
  { action: 'update', subject: 'Registration' },
  { action: 'read', subject: 'Encounter' },
  { action: 'write', subject: 'Encounter' },
  { action: 'read', subject: 'Icd10Code' },
  { action: 'read', subject: 'Icd9cmCode' },
  { action: 'read', subject: 'Medication' },
  { action: 'create', subject: 'Medication' },
  { action: 'update', subject: 'Medication' },
  { action: 'read', subject: 'Prescription' },
  { action: 'write', subject: 'DispenseRecord' },
  { action: 'read', subject: 'Inventory' },
  { action: 'write', subject: 'Inventory' },
  // IMP-16. The fallback rule set for a seeded ADMIN whose token carries no
  // permission claim — the ward clerk's reach, matching the IMP-12 grants.
  { action: 'read', subject: 'RoomClass' },
  { action: 'create', subject: 'RoomClass' },
  { action: 'update', subject: 'RoomClass' },
  { action: 'delete', subject: 'RoomClass' },
  { action: 'read', subject: 'Ward' },
  { action: 'create', subject: 'Ward' },
  { action: 'update', subject: 'Ward' },
  { action: 'delete', subject: 'Ward' },
  { action: 'read', subject: 'Room' },
  { action: 'create', subject: 'Room' },
  { action: 'update', subject: 'Room' },
  { action: 'delete', subject: 'Room' },
  { action: 'read', subject: 'Bed' },
  { action: 'create', subject: 'Bed' },
  { action: 'update', subject: 'Bed' },
  { action: 'delete', subject: 'Bed' },
  { action: 'read', subject: 'Admission' },
  { action: 'update', subject: 'Admission' },
  { action: 'admit', subject: 'Admission' },
  { action: 'transfer', subject: 'Admission' },
  { action: 'discharge', subject: 'Admission' },
  { action: 'cancel', subject: 'Admission' },
  { action: 'read', subject: 'ServiceTariff' },
  { action: 'write', subject: 'ServiceTariff' },
  { action: 'read', subject: 'Invoice' },
  { action: 'write', subject: 'Invoice' },
  // P16-T25. `seed.sql` gives ADMIN the deliver key; an admin whose hint
  // predates it keeps the Send button rather than losing it to the preset.
  { action: 'deliver', subject: 'Invoice' },
  { action: 'write', subject: 'Payment' },
  { action: 'create', subject: 'ChatSession' },
  { action: 'read', subject: 'ChatSession' },
  { action: 'delete', subject: 'ChatSession' },
  { action: 'create', subject: 'ChatMessage' },
  { action: 'read', subject: 'ChatMessage' },
  { action: 'read', subject: 'Conversation' },
  { action: 'write', subject: 'Conversation' },
  { action: 'block', subject: 'Conversation' },
  { action: 'merge', subject: 'Patient' },
  { action: 'read', subject: 'AiProviderConfig' },
  { action: 'write', subject: 'AiProviderConfig' },
  // P16-T02. Both grants, mirroring what `seed.sql` gives ADMIN, so an admin
  // whose session hint predates them still reaches the clinic-profile tab
  // rather than losing it to a silently narrower preset.
  { action: 'read', subject: 'ClinicProfile' },
  { action: 'write', subject: 'ClinicProfile' },
  // P16-T08. The three patient-document grants `seed.sql` gives ADMIN, so an
  // admin whose session hint predates them still sees the Documents tab on a
  // patient record. `release` is deliberately absent: it is a clinician's
  // grant on their own patients, never an administrator's.
  { action: 'read', subject: 'PatientDocument' },
  { action: 'write', subject: 'PatientDocument' },
  { action: 'delete', subject: 'PatientDocument' },
  // P16-T17. An administrator has a vault of their own on the same terms as a
  // doctor — an admin is also a person with a contract and a KTP. It grants
  // them nothing over anyone else's: there is no `:any` key in the catalog
  // for this subject at all.
  { action: 'read', subject: 'VaultDocument' },
  { action: 'write', subject: 'VaultDocument' },
  { action: 'read', subject: 'DocumentTemplate' },
  { action: 'write', subject: 'DocumentTemplate' },
  { action: 'manage', subject: 'BpjsConfig' },
  { action: 'sync', subject: 'BpjsReference' },
  { action: 'read', subject: 'BpjsReference' },
  { action: 'manage', subject: 'BpjsMapping' },
  { action: 'check', subject: 'BpjsEligibility' },
  { action: 'read', subject: 'BpjsSubmission' },
  { action: 'retry', subject: 'BpjsSubmission' },
  { action: 'link', subject: 'Satusehat' },
  { action: 'read', subject: 'SatusehatSubmission' },
  { action: 'retry', subject: 'SatusehatSubmission' },
  { action: 'read', subject: 'Notification' },
  { action: 'manage', subject: 'Notification' },
  // SJ-1. Mirrors the three organization grants `seed.sql` gives ADMIN, so an
  // admin whose session hint predates them still reaches the org chart rather
  // than losing the nav entry to a silently narrower preset.
  { action: 'read', subject: 'OrganizationUnit' },
  { action: 'manage', subject: 'OrganizationUnit' },
  { action: 'manage', subject: 'OrganizationUnitMember' },
];

/**
 * The fallback rule set for a SUPER_ADMIN whose token carries no usable
 * permission claim.
 *
 * `seed.sql` grants SUPER_ADMIN the catalog-wide union — every row in
 * `permissions`, by construction rather than by enumeration — so the honest
 * mirror of that on the client is CASL's own wildcard. Listing the grants
 * instead would drift the moment a ticket seeds a new permission, and drift
 * here is invisible: it does not fail a build, it silently hides a button.
 * That is exactly how role creation disappeared for SUPER_ADMIN, which held
 * `role.create:any` in the database while the preset above stopped at
 * `read`.
 *
 * Visibility only, like every rule in this file. `PermissionsGuard` re-reads
 * permissions from the database on every request, so a forged session hint
 * claiming the SUPER_ADMIN code buys a fully-populated menu and no data.
 */
export const SUPER_ADMIN_PORTAL_RULES: AppRule[] = [{ action: 'manage', subject: 'all' }];
