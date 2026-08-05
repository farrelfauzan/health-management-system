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
  | 'approve'
  | 'manage'
  | 'sync'
  | 'check'
  | 'retry'
  | 'link'
  | 'read-identifier'
  | 'import-identifier';
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
  | 'Encounter'
  | 'Icd10Code'
  | 'Icd9cmCode'
  | 'Medication'
  | 'Inventory'
  | 'Prescription'
  | 'DispenseRecord'
  | 'ServiceTariff'
  | 'Invoice'
  | 'Payment'
  | 'ChatSession'
  | 'ChatMessage'
  | 'AiProviderConfig'
  | 'Document'
  | 'BpjsConfig'
  | 'BpjsReference'
  | 'BpjsMapping'
  | 'BpjsEligibility'
  | 'BpjsSubmission'
  | 'Satusehat'
  | 'SatusehatSubmission'
  | 'all';
export type AppAbility = MongoAbility<[AppAction, AppSubject]>;
export type AppRule = RawRuleOf<AppAbility>;

export function buildAppAbility(rules: AppRule[]): AppAbility {
  return createMongoAbility<AppAbility>(rules);
}
