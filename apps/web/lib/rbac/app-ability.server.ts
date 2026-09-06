import {
  ADMIN_PORTAL_ADMIN_RULES,
  SUPER_ADMIN_PORTAL_RULES,
  type AppAction,
  type AppRule,
  type AppSubject,
} from '@hms/ui';

import { hasAnyRole, type AccessTokenClaims } from '#lib/auth/access-token-claims';

// Split deliberately. These two codes do *not* hold the same rights: `seed.sql`
// withholds `role.create/update/delete:any` from ADMIN on purpose — a role that
// can mint roles holding any permission is a super-admin capability — while
// SUPER_ADMIN picks them up from the catalog-wide grant. Collapsing both into
// one fallback gave SUPER_ADMIN the ADMIN preset and hid role management.
const SUPER_ADMIN_ROLES = ['SUPER_ADMIN'];
const ADMIN_ROLES = ['ADMIN'];
const SUPPORTED_ACTIONS: AppAction[] = [
  'create',
  'read',
  'update',
  'delete',
  'assign',
  'unassign',
  'write',
  'cancel',
  'approve',
  'manage',
  'sync',
  'check',
  'retry',
  'link',
  'read-identifier',
  'import-identifier',
  'admit',
  'transfer',
  'discharge',
  'block',
  'merge',
  'release',
  'share',
  'offboard',
  // P16-T25. Every `invoice.deliver:any` in a session hint was dropped here
  // until this line existed, which hid the Send button from every admin.
  'deliver',
  // P16-T29. Same trap, same fix: `document-approval.decide:any` resolves to
  // nothing without this entry, and the approve/reject controls silently
  // never render for anyone.
  'decide',
];
const SUBJECT_BY_RESOURCE: Record<string, AppSubject> = {
  user: 'User',
  role: 'Role',
  patient: 'Patient',
  doctor: 'Doctor',
  'doctor.schedule': 'DoctorSchedule',
  'doctor-patient': 'DoctorPatient',
  'doctor-patient.activity': 'DoctorPatientActivity',
  appointment: 'Appointment',
  'appointment.session': 'AppointmentSession',
  registration: 'Registration',
  encounter: 'Encounter',
  'icd10-code': 'Icd10Code',
  'icd9cm-code': 'Icd9cmCode',
  medication: 'Medication',
  inventory: 'Inventory',
  prescription: 'Prescription',
  notification: 'Notification',
  dispense: 'DispenseRecord',
  // IMP-16. Three inventory subjects rather than one, mirroring the three
  // CASL subjects the API's permission catalogue defines — a role that may
  // rename beds is not thereby a role that may close a ward, and the sidebar
  // must not imply otherwise.
  // Undotted on purpose: `permissionToRule` splits an `a.b.c` key into
  // resource `a.b` and action `c`, so a `room.class.*` key would resolve to
  // the `Room` subject and silently widen a class grant into a room grant.
  roomclass: 'RoomClass',
  ward: 'Ward',
  room: 'Room',
  bed: 'Bed',
  // Both scopes collapse here, as they do for `document`. `permissionToRule`
  // drops the `:own` / `:any` suffix, so this cannot tell a ward clerk's
  // clinic-wide grant from a doctor's own-patients one — and must not try.
  // It decides whether the Admissions entry is visible; the API decides
  // whose stays come back.
  admission: 'Admission',
  'service-tariff': 'ServiceTariff',
  invoice: 'Invoice',
  payment: 'Payment',
  'chat.session': 'ChatSession',
  'chat.message': 'ChatMessage',
  // The WhatsApp/Telegram channel's staff surface (`PCS-T08`). Unlike
  // `document` above, both scopes do *not* collapse here — every conversation
  // grant exists only as `:any`, because a conversation has no HMS user on
  // either end for an `:own` scope to resolve against.
  conversation: 'Conversation',
  'ai-provider': 'AiProviderConfig',
  // P16-T02. Hyphen, not dot: `permissionToRule` splits on dots, so
  // `clinic-profile.read:any` resolves to resource `clinic-profile` and
  // action `read` — one segment, the way `service-tariff` does.
  'clinic-profile': 'ClinicProfile',
  // P16-T11. Same hyphenated single-segment shape as `clinic-profile`:
  // `document-template.write:any` → resource `document-template`, action
  // `write`.
  'document-template': 'DocumentTemplate',
  // P16-T39. Same hyphenated single-segment shape: `document-type.write:any`
  // → resource `document-type`, action `write`; `managed-document.read:any`
  // → resource `managed-document`, action `read`.
  'document-type': 'DocumentType',
  'managed-document': 'ManagedDocument',
  // P16-T29. Same hyphenated single-segment shape:
  // `document-approval.decide:any` → resource `document-approval`, action
  // `decide`.
  'document-approval': 'DocumentApproval',
  // Both scopes collapse to one subject here. `permissionToRule` drops the
  // `:own` / `:any` suffix, so this cannot distinguish an admin's clinic-corpus
  // grant from a clinician's personal one — and must not try to. It decides
  // whether the knowledge-base nav entry is visible; the API decides whose
  // documents come back.
  document: 'Document',
  // P16-T08. Hyphen, not dot, for the same reason as `clinic-profile`. The
  // `:own` / `:any` suffix collapses here as it does for `document`: this
  // decides whether the Documents tab renders, and the API decides whether a
  // doctor's `write:own` reaches this particular patient.
  'patient-document': 'PatientDocument',
  // P16-T16/T17. Hyphen, not dot, for the same reason as `clinic-profile`.
  // Unlike `document` above, there is no scope to collapse: every
  // `vault-document.*` key in the catalog is `:own`, and no `:any` form
  // exists for any role — so this rule can only ever mean the owner's own
  // vault, whatever a session hint claims.
  'vault-document': 'VaultDocument',
  'bpjs.config': 'BpjsConfig',
  'bpjs.reference': 'BpjsReference',
  'bpjs.mapping': 'BpjsMapping',
  'bpjs.eligibility': 'BpjsEligibility',
  'bpjs.submission': 'BpjsSubmission',
  satusehat: 'Satusehat',
  'satusehat.submission': 'SatusehatSubmission',
  // SJ-1. Dotted, and safely so: `permissionToRule` splits on the *last* dot,
  // so `organization.structure.manage:any` resolves to resource
  // `organization.structure` and action `manage` — the same two-segment shape
  // as `doctor.schedule` and `appointment.session` above. Two entries rather
  // than a single `organization`, because merging them would make a grant to
  // maintain the chart also read as a grant over headcount.
  'organization.structure': 'OrganizationUnit',
  'organization.member': 'OrganizationUnitMember',
};

function isSupportedAction(action: string): action is AppAction {
  return SUPPORTED_ACTIONS.includes(action as AppAction);
}

function permissionToRule(permission: string): AppRule | null {
  const segments = permission.split('.');
  const actionScope = segments.pop() ?? '';
  const resource = segments.join('.');
  const [action] = actionScope.split(':');

  if (!resource || !action || !isSupportedAction(action)) {
    return null;
  }

  const subject = SUBJECT_BY_RESOURCE[resource];
  if (!subject) {
    return null;
  }

  return {
    action,
    subject,
  };
}

export function resolveAppAbilityRules(claims: AccessTokenClaims | null): AppRule[] {
  if (!claims) {
    return [];
  }

  const permissionRules = (claims.permissions ?? [])
    .map(permissionToRule)
    .filter((rule): rule is AppRule => Boolean(rule));

  if (permissionRules.length > 0) {
    return permissionRules;
  }

  if (hasAnyRole(claims, SUPER_ADMIN_ROLES)) {
    return SUPER_ADMIN_PORTAL_RULES;
  }

  if (hasAnyRole(claims, ADMIN_ROLES)) {
    return ADMIN_PORTAL_ADMIN_RULES;
  }

  return [];
}
