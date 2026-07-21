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
  { action: 'assign', subject: 'DoctorPatient' },
  { action: 'unassign', subject: 'DoctorPatient' },
  { action: 'read', subject: 'DoctorPatientActivity' },
  { action: 'read', subject: 'Doctor' },
  { action: 'create', subject: 'Doctor' },
  { action: 'update', subject: 'Doctor' },
  { action: 'write', subject: 'DoctorSchedule' },
  { action: 'read', subject: 'Appointment' },
  { action: 'read', subject: 'Registration' },
  { action: 'read', subject: 'Medication' },
  { action: 'read', subject: 'Prescription' },
];
