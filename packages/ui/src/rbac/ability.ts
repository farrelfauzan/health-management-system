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
  | 'import-identifier'
  | 'admit'
  | 'transfer'
  | 'discharge'
  | 'block'
  | 'merge';
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
  | 'RoomClass'
  | 'Ward'
  | 'Room'
  | 'Bed'
  | 'Admission'
  | 'ServiceTariff'
  | 'Invoice'
  | 'Payment'
  | 'ChatSession'
  | 'ChatMessage'
  | 'Conversation'
  | 'AiProviderConfig'
  | 'Document'
  // P16-T02. The clinic's own identity, printed on everything the clinic
  // hands out — read by every role that produces a document, written by
  // administrators alone.
  | 'ClinicProfile'
  // P16-T11. Invoice (later: clinical, agreement) layouts and the variable
  // registry they are authored against — read by whoever opens the editor,
  // written by administrators alone.
  | 'DocumentTemplate'
  | 'BpjsConfig'
  | 'BpjsReference'
  | 'BpjsMapping'
  | 'BpjsEligibility'
  | 'BpjsSubmission'
  | 'Satusehat'
  | 'SatusehatSubmission'
  | 'Notification'
  // SJ-1. Two subjects rather than one, mirroring the API's catalogue: a role
  // that maintains the boxes on the org chart is not thereby a role that
  // decides which box an employee sits in.
  | 'OrganizationUnit'
  | 'OrganizationUnitMember'
  | 'all';
export type AppAbility = MongoAbility<[AppAction, AppSubject]>;
export type AppRule = RawRuleOf<AppAbility>;

export function buildAppAbility(rules: AppRule[]): AppAbility {
  return createMongoAbility<AppAbility>(rules);
}
