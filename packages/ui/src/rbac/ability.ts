import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability';

export type AppAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'assign'
  | 'unassign'
  | 'write'
  | 'cancel'
  | 'approve';
export type AppSubject =
  | 'User'
  | 'Role'
  | 'Patient'
  | 'Doctor'
  | 'DoctorSchedule'
  | 'DoctorPatient'
  | 'DoctorPatientActivity'
  | 'Appointment'
  | 'AppointmentSession'
  | 'Registration'
  | 'Medication'
  | 'Prescription'
  | 'DispenseRecord'
  | 'ChatSession'
  | 'ChatMessage'
  | 'all';
export type AppAbility = MongoAbility<[AppAction, AppSubject]>;
export type AppRule = RawRuleOf<AppAbility>;

export function buildAppAbility(rules: AppRule[]): AppAbility {
  return createMongoAbility<AppAbility>(rules);
}
