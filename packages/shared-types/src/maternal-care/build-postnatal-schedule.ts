import { buildPostnatalVisitWindows } from '#maternal-care/build-postnatal-visit-windows';
import type { PostnatalScheduleEntry } from '#maternal-care/contracts';
import { resolvePostnatalWindowStatus } from '#maternal-care/resolve-postnatal-window-status';
import type { PostnatalSubjectValue, PostnatalVisitCodeValue } from '#maternal-care/schemas';

/** One visit as the schedule counts it: its effective code, never a cancelled one. */
type PostnatalScheduleVisit = {
  encounterId: string;
  startedAt: Date;
  subject: PostnatalSubjectValue;
  visitCode: PostnatalVisitCodeValue | null;
  isCancelled: boolean;
};

/**
 * The seven windows of one birth with where each stands (P25-T12). A window
 * is fulfilled by the earliest non-cancelled visit carrying its code; a visit
 * outside every window fulfils none.
 *
 * KN windows count any baby of the birth: twins share one KN1, which is an
 * open question for product rather than a rule this function invents.
 */
export function buildPostnatalSchedule(params: {
  birthAt: Date;
  timeZone: string;
  visits: readonly PostnatalScheduleVisit[];
  asOf: Date;
}): PostnatalScheduleEntry[] {
  const countedVisits = params.visits
    .filter((visit) => !visit.isCancelled && visit.visitCode !== null)
    .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
  return buildPostnatalVisitWindows(params).map((window) => {
    const fulfilling = countedVisits.find(
      (visit) => visit.subject === window.subject && visit.visitCode === window.code,
    );
    return {
      code: window.code,
      subject: window.subject,
      startsAt: window.startsAt.toISOString(),
      endsAt: window.endsAt.toISOString(),
      status: resolvePostnatalWindowStatus({
        window,
        isFulfilled: fulfilling !== undefined,
        asOf: params.asOf,
      }),
      fulfilledBy:
        fulfilling === undefined
          ? null
          : { encounterId: fulfilling.encounterId, startedAt: fulfilling.startedAt.toISOString() },
    };
  });
}
