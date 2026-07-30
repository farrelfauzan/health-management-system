import { ADMIN_PORTAL_ADMIN_RULES, type AppAction, type AppRule, type AppSubject } from '@hms/ui';

import { hasAnyRole, type AccessTokenClaims } from '#lib/auth/access-token-claims';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
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
  dispense: 'DispenseRecord',
  'service-tariff': 'ServiceTariff',
  invoice: 'Invoice',
  payment: 'Payment',
  'chat.session': 'ChatSession',
  'chat.message': 'ChatMessage',
  'bpjs.config': 'BpjsConfig',
  'bpjs.reference': 'BpjsReference',
  'bpjs.mapping': 'BpjsMapping',
  'bpjs.eligibility': 'BpjsEligibility',
  'bpjs.submission': 'BpjsSubmission',
  satusehat: 'Satusehat',
  'satusehat.submission': 'SatusehatSubmission',
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

  if (hasAnyRole(claims, ADMIN_ROLES)) {
    return ADMIN_PORTAL_ADMIN_RULES;
  }

  return [];
}
