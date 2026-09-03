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
  | 'merge'
  // P16-T08. Handing a clinical file to the patient portal. Distinct from
  // `write`: the API grants it to doctors on their own patients only, and
  // editing a title must not read as permission to publish the file.
  | 'release';
export type AppSubject =
  | 'User'
  | 'Role'
  | 'Patient'
  | 'Doctor'
  // P16-T19. The clinic's licence expiry roster. Its own subject rather than
  // an action on `Doctor`, because `Doctor` read is held by doctors and
  // patients — the directory is something a patient browses when choosing who
  // to book with, and a list of who is out of licence is not.
  | 'DoctorLicenseExpiry'
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
  // P16-T08. A patient's clinical file — lab results, referral letters,
  // consent forms. Its own subject rather than a mode of `Document`, because
  // the knowledge-base grant and the medical-record grant are held by
  // different roles and must never be confused for one another.
  | 'PatientDocument'
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
