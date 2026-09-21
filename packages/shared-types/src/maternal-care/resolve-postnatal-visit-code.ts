import { buildPostnatalVisitWindows } from '#maternal-care/build-postnatal-visit-windows';
import type { PostnatalSubjectValue, PostnatalVisitCodeValue } from '#maternal-care/schemas';

/**
 * The KF or KN code a visit at `visitedAt` earns, or null when it falls
 * outside every window of its subject — before 6 hours, in the KN1–KN2 gap,
 * or after the last window (P25-T12).
 */
export function resolvePostnatalVisitCode(params: {
  birthAt: Date;
  visitedAt: Date;
  subject: PostnatalSubjectValue;
  timeZone: string;
}): PostnatalVisitCodeValue | null {
  const visitedTime = params.visitedAt.getTime();
  const window = buildPostnatalVisitWindows(params).find(
    (candidate) =>
      candidate.subject === params.subject &&
      visitedTime >= candidate.startsAt.getTime() &&
      visitedTime <= candidate.endsAt.getTime(),
  );
  return window?.code ?? null;
}
