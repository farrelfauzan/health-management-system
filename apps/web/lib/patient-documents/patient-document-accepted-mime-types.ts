import type { DocumentUploadMimeTypeValue } from '@hms/shared-types';

/**
 * What the patient-documents picker offers: PDF and the three image types.
 *
 * Narrower than the document store's own allowlist, which also takes Markdown
 * and plain text for the knowledge-base corpora. A clinical file is a scan,
 * a photo, or a signed PDF — a `.txt` in a patient's medical record is almost
 * always a mistake, and the picker not offering it is cheaper than a
 * clinician discovering the mistake later. The API still accepts the wider
 * set; this is the surface's choice, not the store's.
 */
export const PATIENT_DOCUMENT_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const satisfies readonly DocumentUploadMimeTypeValue[];
