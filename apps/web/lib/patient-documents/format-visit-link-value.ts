import { VISIT_LINK_NONE } from '#lib/patient-documents/visit-link-value';

type VisitLink = {
  encounterId: string | null | undefined;
  admissionId: string | null | undefined;
};

/** The `<Select>` value for a document's current visit link. */
export function formatVisitLinkValue({ encounterId, admissionId }: VisitLink): string {
  if (encounterId) {
    return `encounter:${encounterId}`;
  }
  if (admissionId) {
    return `admission:${admissionId}`;
  }
  return VISIT_LINK_NONE;
}
