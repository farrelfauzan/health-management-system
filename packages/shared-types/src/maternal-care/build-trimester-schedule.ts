import type {
  DoctorVisitRequirement,
  GestationalAge,
  NumberedAntenatalVisit,
  PregnancyTrimester,
  TrimesterScheduleEntry,
  TrimesterScheduleState,
} from '#maternal-care/types';

/**
 * Permenkes 21/2021: at least six antenatal contacts, distributed one in the
 * first trimester, two in the second and three in the third (Lampiran I,
 * confirmed by P25-T01 answer 2).
 */
const REQUIRED_VISITS_BY_TRIMESTER: Readonly<Record<PregnancyTrimester, number>> = {
  1: 1,
  2: 2,
  3: 3,
};
/** The week each trimester closes; trimester 3 closes at birth, not at a week. */
const TRIMESTER_LAST_WEEK: Readonly<Record<PregnancyTrimester, number | null>> = {
  1: 12,
  2: 24,
  3: null,
};
/** The two trimesters that must include a doctor visit (Pasal 13(4)–(5)). */
const DOCTOR_VISIT_TRIMESTERS: readonly PregnancyTrimester[] = [1, 3];
const ALL_TRIMESTERS: readonly PregnancyTrimester[] = [1, 2, 3];

/**
 * What each trimester of this pregnancy owes and what it has (P25-T06).
 *
 * `MISSED` is only ever said once the window has actually closed — the
 * gestational age is past the trimester's last week and the count came up
 * short. Before that a shortfall is `DUE`, because a mother at 20 weeks with
 * one second-trimester visit has not missed anything, she simply has not been
 * yet. Trimester 3 has no closing week, so it is never `MISSED` while the
 * pregnancy is still running; the delivery is what settles it (P25-T09).
 *
 * The doctor-visit line is separate from the count on purpose: a trimester can
 * have all its visits and still owe the dokter/SpOG contact Pasal 13(4)–(5)
 * requires, and a midwife reading "3/3" would otherwise think she was done.
 */
export function buildTrimesterSchedule(params: {
  visits: readonly NumberedAntenatalVisit[];
  currentGestationalAge: GestationalAge;
  doctorVisits: readonly DoctorVisitRequirement[];
}): TrimesterScheduleEntry[] {
  return ALL_TRIMESTERS.map((trimester) => {
    const requiredVisitCount = REQUIRED_VISITS_BY_TRIMESTER[trimester];
    const completedVisitCount = params.visits.filter(
      (visit) => visit.trimester === trimester,
    ).length;
    return {
      trimester,
      requiredVisitCount,
      completedVisitCount,
      state: resolveState({
        requiredVisitCount,
        completedVisitCount,
        trimester,
        currentGestationalAge: params.currentGestationalAge,
      }),
      doctorVisit: DOCTOR_VISIT_TRIMESTERS.includes(trimester)
        ? (params.doctorVisits.find((visit) => visit.trimester === trimester) ?? {
            trimester,
            isMet: false,
            isUltrasoundRecorded: false,
          })
        : null,
    };
  });
}

function resolveState(params: {
  requiredVisitCount: number;
  completedVisitCount: number;
  trimester: PregnancyTrimester;
  currentGestationalAge: GestationalAge;
}): TrimesterScheduleState {
  if (params.completedVisitCount >= params.requiredVisitCount) {
    return 'DONE';
  }
  const lastWeek = TRIMESTER_LAST_WEEK[params.trimester];
  const hasWindowClosed = lastWeek !== null && params.currentGestationalAge.weeks > lastWeek;
  return hasWindowClosed ? 'MISSED' : 'DUE';
}
