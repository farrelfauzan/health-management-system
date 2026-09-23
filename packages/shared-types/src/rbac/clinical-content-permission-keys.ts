/**
 * The permission keys that reach clinical record content under D-033
 * (P22-T02): notes and impressions, diagnoses, procedures, vitals,
 * prescriptions and dispensing, lab orders, specimens and results, clinical
 * documents, the content of chat about a patient's health, and the maternal
 * registers built from them.
 *
 * `seed.sql` stops SUPER_ADMIN's catalogue-wide union at exactly this set, and
 * `clinical-access-seed.spec.ts` fails CI when the two drift. It lives here so
 * the IAM screen can tell an administrator that ticking one of these hands the
 * role the patient's record (P22-T04), instead of leaving that to a decision
 * record nobody reads while composing a role.
 */
export const CLINICAL_CONTENT_PERMISSION_KEYS: readonly string[] = [
  'encounter.read:any',
  'encounter.write:any',
  'encounter.record-vitals:any',
  'prescription.read:any',
  'prescription.write:any',
  'dispense.write:any',
  'lab-order.read:any',
  'lab-order.write:any',
  'lab-specimen.write:any',
  'lab-result.write:any',
  'lab-result.verify:any',
  'patient-document.read:any',
  'patient-document.write:any',
  'patient-document.delete:any',
  'chat.message.read:any',
  'maternal-report.read:any',
];
