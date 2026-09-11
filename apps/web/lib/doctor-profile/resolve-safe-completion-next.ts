import { DOCTOR_PROFILE_COMPLETION } from '#lib/doctor-profile/doctor-profile-completion';

const DOCTOR_HOME_PATH = '/doctor/dashboard';
const DOCTOR_PATH_PREFIX = '/doctor/';

/**
 * Where to send a doctor once their profile is complete (P20-T02).
 *
 * `proxy.ts` records the page they were heading for in `next`, but the value
 * arrives in a URL anybody can craft, so only a path inside the doctor shell
 * is honoured — never another origin (`//evil.test`), never back to the
 * completion screen itself. Everything else lands on the dashboard.
 */
export function resolveSafeCompletionNext(next: string | undefined): string {
  if (
    !next ||
    !next.startsWith(DOCTOR_PATH_PREFIX) ||
    next.startsWith('//') ||
    next.includes('\\') ||
    next.startsWith(DOCTOR_PROFILE_COMPLETION.path)
  ) {
    return DOCTOR_HOME_PATH;
  }
  return next;
}
