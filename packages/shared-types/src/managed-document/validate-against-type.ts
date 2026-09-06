import type { DocumentContentModeValue } from '#managed-document/schemas';

/** The three flags on a type row that shape a document of it (FR-E5-35). */
export type ManagedDocumentTypeRules = {
  requiresPatient: boolean;
  requiresDoctor: boolean;
  contentMode: DocumentContentModeValue;
};

/** What a document would look like after a write — parties and which body it carries. */
export type ManagedDocumentShape = {
  patientId: string | null;
  doctorId: string | null;
  hasContentHtml: boolean;
  hasStorageKey: boolean;
};

export const MANAGED_DOCUMENT_RULE_ISSUE_CODES = [
  'PATIENT_REQUIRED',
  'DOCTOR_REQUIRED',
  'PATIENT_NOT_ALLOWED',
  'DOCTOR_NOT_ALLOWED',
  'CONTENT_MUST_BE_DRAFTED',
  'CONTENT_MUST_BE_UPLOADED',
  'CONTENT_BOTH',
] as const;

export type ManagedDocumentRuleIssueCode = (typeof MANAGED_DOCUMENT_RULE_ISSUE_CODES)[number];

/** One rule a document breaks, with the field the form should point at. */
export type ManagedDocumentRuleIssue = {
  code: ManagedDocumentRuleIssueCode;
  field: 'patientId' | 'doctorId' | 'contentHtml' | 'storageKey';
};

/**
 * FR-E5-35 as one pure function (`P16-T36`): the party a type requires must
 * be named, a party the type does not require may not be, and the body must
 * match the content mode — drafted, uploaded, or one of the two. The API
 * runs it against the type row on every create and edit (a 422 naming each
 * issue); the web form runs it as it builds itself from the same flags, so
 * the two never disagree about what the form should ask for.
 *
 * A policy-type document — `CLINIC_POLICY_SOP`, requiring neither party —
 * therefore *refuses* a patient rather than silently dropping one: a
 * patient named on a document that has no place for them is a mistake the
 * drafter should see, not one the server should hide.
 */
export function validateManagedDocumentAgainstType(
  rules: ManagedDocumentTypeRules,
  shape: ManagedDocumentShape,
): ManagedDocumentRuleIssue[] {
  return [...collectPartyIssues(rules, shape), ...collectContentIssues(rules, shape)];
}

function collectPartyIssues(
  rules: ManagedDocumentTypeRules,
  shape: ManagedDocumentShape,
): ManagedDocumentRuleIssue[] {
  const issues: ManagedDocumentRuleIssue[] = [];
  if (rules.requiresPatient && shape.patientId === null) {
    issues.push({ code: 'PATIENT_REQUIRED', field: 'patientId' });
  }
  if (!rules.requiresPatient && shape.patientId !== null) {
    issues.push({ code: 'PATIENT_NOT_ALLOWED', field: 'patientId' });
  }
  if (rules.requiresDoctor && shape.doctorId === null) {
    issues.push({ code: 'DOCTOR_REQUIRED', field: 'doctorId' });
  }
  if (!rules.requiresDoctor && shape.doctorId !== null) {
    issues.push({ code: 'DOCTOR_NOT_ALLOWED', field: 'doctorId' });
  }
  return issues;
}

function collectContentIssues(
  rules: ManagedDocumentTypeRules,
  shape: ManagedDocumentShape,
): ManagedDocumentRuleIssue[] {
  if (shape.hasContentHtml && shape.hasStorageKey) {
    return [{ code: 'CONTENT_BOTH', field: 'storageKey' }];
  }
  if (rules.contentMode === 'DRAFTED' && shape.hasStorageKey) {
    return [{ code: 'CONTENT_MUST_BE_DRAFTED', field: 'storageKey' }];
  }
  if (rules.contentMode === 'UPLOADED' && (shape.hasContentHtml || !shape.hasStorageKey)) {
    return [{ code: 'CONTENT_MUST_BE_UPLOADED', field: 'storageKey' }];
  }
  return [];
}
