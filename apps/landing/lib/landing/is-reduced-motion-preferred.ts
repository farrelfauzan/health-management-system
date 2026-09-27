const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the visitor asked the OS to reduce motion; false during server rendering. */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
