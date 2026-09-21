import type { ClinicalRequestRenderContext } from '@hms/shared-types';

/**
 * Which record each rendered kind's audit row hangs off (P18-T12, extended by
 * P25-T07). The maternal letters hang off the pregnancy episode or the visit
 * that produced them, which is the id their callers pass as `subjectId`.
 */
export const CLINICAL_REQUEST_AUDIT_RESOURCE_BY_KIND: Readonly<
  Record<ClinicalRequestRenderContext['kind'], string>
> = {
  LAB_REQUEST: 'LabOrder',
  PRESCRIPTION: 'Prescription',
  REFERRAL_LETTER: 'AntenatalVisit',
  PREGNANCY_CERTIFICATE: 'PregnancyEpisode',
  BIRTH_CERTIFICATE: 'NewbornCareRecord',
};
