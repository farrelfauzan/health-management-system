import type { ClinicianProfessionValue } from '#doctor-management/schemas';
import { MIDWIFE_CHILD_VISIT_PURPOSE_AGE_LIMIT_MONTHS } from '#emr/schemas';
import { toPatientAgeInMonths } from '#patient-management/to-patient-age-in-months';

/**
 * Whether opening this encounter must name a child visit purpose (P25-T03,
 * FR-AUTH-03): the attending clinician is a midwife and the patient is under
 * 60 months on the clinic-local day. MTBS covers 0–59 months (Permenkes
 * 25/2014 Pasal 1 angka 10), so a child of exactly 60 months is not asked.
 *
 * A doctor is never asked. Shared with the web so the open dialog asks the
 * question by exactly the rule the API enforces.
 */
export function isChildVisitPurposeRequired(params: {
  profession: ClinicianProfessionValue;
  dateOfBirth: Date;
  asOf: Date;
}): boolean {
  if (params.profession !== 'MIDWIFE') {
    return false;
  }
  const ageInMonths = toPatientAgeInMonths({ dateOfBirth: params.dateOfBirth, asOf: params.asOf });
  return ageInMonths < MIDWIFE_CHILD_VISIT_PURPOSE_AGE_LIMIT_MONTHS;
}
