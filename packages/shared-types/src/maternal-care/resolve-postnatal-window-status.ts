import type { PostnatalVisitWindow, PostnatalWindowStatus } from '#maternal-care/types';

/**
 * Where one window stands at `asOf` (P25-T12). A recorded visit wins over the
 * clock: a window that was fulfilled stays FULFILLED after it closes.
 */
export function resolvePostnatalWindowStatus(params: {
  window: PostnatalVisitWindow;
  isFulfilled: boolean;
  asOf: Date;
}): PostnatalWindowStatus {
  if (params.isFulfilled) {
    return 'FULFILLED';
  }
  const now = params.asOf.getTime();
  if (now < params.window.startsAt.getTime()) {
    return 'UPCOMING';
  }
  return now > params.window.endsAt.getTime() ? 'MISSED' : 'DUE';
}
