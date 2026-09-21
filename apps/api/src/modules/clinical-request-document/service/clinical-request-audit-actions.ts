import type { ClinicalRequestRenderContext } from '@hms/shared-types';

import type { AuditAction } from '../../../generated/prisma/client';

/**
 * Which audit action each rendered kind writes (P18-T12, extended by P25-T07).
 *
 * A map rather than the ternary this started as: every print of a clinical
 * document is auditable, and a new kind that fell through a `? :` would be
 * filed silently as a prescription.
 *
 * The two maternal letters share `DOCUMENT_ISSUED`, which already means "a
 * document was rendered and filed", rather than gaining one enum value each —
 * the kind is on the document, and the trail does not need it twice.
 */
export const CLINICAL_REQUEST_AUDIT_ACTION_BY_KIND: Readonly<
  Record<ClinicalRequestRenderContext['kind'], AuditAction>
> = {
  LAB_REQUEST: 'LAB_REQUEST_PRINTED',
  PRESCRIPTION: 'PRESCRIPTION_PRINTED',
  REFERRAL_LETTER: 'DOCUMENT_ISSUED',
  PREGNANCY_CERTIFICATE: 'DOCUMENT_ISSUED',
  BIRTH_CERTIFICATE: 'DOCUMENT_ISSUED',
};
