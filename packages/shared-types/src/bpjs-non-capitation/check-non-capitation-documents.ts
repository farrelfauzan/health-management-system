import { NON_CAPITATION_DOCUMENT_REQUIREMENTS } from '#bpjs-non-capitation/non-capitation-document-requirements';
import type { NonCapitationDocumentCheck } from '#bpjs-non-capitation/contracts';
import type { NonCapitationDocumentSource, NonCapitationUnit } from '#bpjs-non-capitation/types';

/**
 * A document counts for a line when it is filed on one of the line's
 * patients and either sits on the line's encounter or stay, or sits on no
 * visit at all and is dated on or after the service (D-043) — a copy of a KIA
 * page or a birth certificate is often filed on the patient, after the fact.
 * A document on some other visit never counts.
 */
function isDocumentForUnit(
  document: NonCapitationDocumentSource,
  unit: NonCapitationUnit,
): boolean {
  if (!unit.documentPatientIds.includes(document.patientId)) {
    return false;
  }
  if (document.encounterId === null && document.admissionId === null) {
    return document.filedOn >= unit.serviceDate;
  }
  return (
    (unit.encounterId !== null && document.encounterId === unit.encounterId) ||
    (unit.admissionId !== null && document.admissionId === unit.admissionId)
  );
}

/** The line's document checklist: each required category, present or missing. */
export function checkNonCapitationDocuments(
  unit: NonCapitationUnit,
  documents: readonly NonCapitationDocumentSource[],
): NonCapitationDocumentCheck[] {
  const filed = documents.filter((document) => isDocumentForUnit(document, unit));
  return NON_CAPITATION_DOCUMENT_REQUIREMENTS[unit.serviceType].map((category) => ({
    category,
    isPresent: filed.some((document) => document.category === category),
  }));
}
