import { computeGestationalAge } from '#maternal-care/compute-gestational-age';
import { resolveAntenatalVisitCode } from '#maternal-care/resolve-antenatal-visit-code';
import { resolveTrimester } from '#maternal-care/resolve-trimester';
import type {
  AntenatalVisitForNumbering,
  NumberedAntenatalVisit,
  PregnancyTrimester,
} from '#maternal-care/types';

/**
 * Numbers an episode's antenatal visits (P25-T06).
 *
 * Numbering happens **on read**, over the non-cancelled encounters ordered by
 * `startedAt`, so a visit opened in error and cancelled never leaves a hole in
 * the sequence and a backdated visit slots in where it belongs rather than at
 * the end.
 *
 * A code frozen onto a **finished** encounter is returned as it was written
 * and is never recomputed. That is the one place where the derived ordinal and
 * the reported code can disagree — cancel the second visit, and a later open
 * visit renumbers while an already-closed one keeps the code it was closed
 * with. That is deliberate: a closed record is what was reported, and a report
 * already sent upstream does not change because a different visit was later
 * struck out.
 */
export function numberAntenatalVisits(params: {
  visits: readonly AntenatalVisitForNumbering[];
  lastMenstrualPeriodDate: Date | null;
  estimatedDeliveryDate: Date;
}): NumberedAntenatalVisit[] {
  const countedVisits = params.visits
    .filter((visit) => !visit.isCancelled)
    .toSorted((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
  const firstVisitTrimester = resolveVisitTrimester(countedVisits[0], params);
  return countedVisits.map((visit, index) => {
    const ordinal = index + 1;
    return {
      encounterId: visit.encounterId,
      ordinal,
      visitCode: visit.frozenVisitCode ?? resolveAntenatalVisitCode({ ordinal, firstVisitTrimester }),
      trimester: resolveVisitTrimester(visit, params),
    };
  });
}

function resolveVisitTrimester(
  visit: AntenatalVisitForNumbering | undefined,
  episode: { lastMenstrualPeriodDate: Date | null; estimatedDeliveryDate: Date },
): PregnancyTrimester | null {
  if (visit === undefined) {
    return null;
  }
  return resolveTrimester(
    computeGestationalAge({
      lastMenstrualPeriodDate: episode.lastMenstrualPeriodDate,
      estimatedDeliveryDate: episode.estimatedDeliveryDate,
      asOf: visit.startedAt,
    }),
  );
}
