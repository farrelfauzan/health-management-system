import { computeGestationalAge } from '#maternal-care/compute-gestational-age';
import { resolveTrimester } from '#maternal-care/resolve-trimester';
import type {
  DoctorVisitRequirement,
  ExternalDoctorVisit,
  PregnancyTrimester,
} from '#maternal-care/types';

/** Permenkes 21/2021 Pasal 13(4)–(5): one in trimester 1, one in trimester 3. */
const DOCTOR_VISIT_TRIMESTERS: readonly PregnancyTrimester[] = [1, 3];

/**
 * Whether the two required doctor visits have happened (P25-T06, FR-ANC-07).
 *
 * Permenkes 21/2021 Pasal 13(4)–(5) requires that at least two of the six
 * contacts are with a dokter or SpOG, one in trimester 1 and one in trimester
 * 3, both with ultrasound. P25-T01 confirmed 21/2021 is still in force for
 * masa hamil — Permenkes 2/2025 Pasal 85 huruf d revoked only its
 * contraception and sexual-health parts — so this is a MUST, not a nicety.
 *
 * A visit counts whether it happened here, with a clinician whose profession
 * is `DOCTOR`, or **at another facility**, which is how a klinik bidan without
 * a doctor meets the rule: she refers the mother out. Refusing to count the
 * referred visit would mark the midwife who did exactly the right thing as
 * non-compliant.
 *
 * `isUltrasoundRecorded` is reported separately from `isMet` and is true only
 * for an external visit the midwife ticked as having had one. This system
 * records no ultrasound of its own yet (out of scope here), so an in-house
 * doctor visit meets the contact requirement while leaving the ultrasound
 * unevidenced rather than assumed.
 */
export function resolveDoctorVisitRequirements(params: {
  lastMenstrualPeriodDate: Date | null;
  estimatedDeliveryDate: Date;
  inHouseDoctorVisitDates: readonly Date[];
  externalDoctorVisits: readonly ExternalDoctorVisit[];
}): DoctorVisitRequirement[] {
  return DOCTOR_VISIT_TRIMESTERS.map((trimester) => {
    const hasInHouseVisit = params.inHouseDoctorVisitDates.some(
      (visitedAt) => resolveVisitTrimester(visitedAt, params) === trimester,
    );
    const matchingExternalVisits = params.externalDoctorVisits.filter(
      (visit) => resolveVisitTrimester(visit.visitedAt, params) === trimester,
    );
    return {
      trimester,
      isMet: hasInHouseVisit || matchingExternalVisits.length > 0,
      isUltrasoundRecorded: matchingExternalVisits.some((visit) => visit.isUltrasoundDone),
    };
  });
}

function resolveVisitTrimester(
  visitedAt: Date,
  episode: { lastMenstrualPeriodDate: Date | null; estimatedDeliveryDate: Date },
): PregnancyTrimester {
  return resolveTrimester(
    computeGestationalAge({
      lastMenstrualPeriodDate: episode.lastMenstrualPeriodDate,
      estimatedDeliveryDate: episode.estimatedDeliveryDate,
      asOf: visitedAt,
    }),
  );
}
