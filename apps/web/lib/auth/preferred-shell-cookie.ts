import type { PortalShellValue } from '@hms/shared-types';

export const PREFERRED_SHELL_COOKIE_NAME = 'hms_preferred_shell';

const SHELL_VALUES: readonly PortalShellValue[] = ['ADMIN', 'DOCTOR', 'PATIENT'];
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * The shell someone last switched to (P22-T05), so signing in again lands
 * there rather than always on the admin shell. A preference, not a grant:
 * `proxy.ts` honours it only for a shell the session may open, and ignores
 * anything else a hand-edited cookie says.
 */
export function parsePreferredShell(value: string | undefined): PortalShellValue | null {
  return SHELL_VALUES.find((shell) => shell === value) ?? null;
}

/** Records the choice from the shell switcher in the browser. */
export function writePreferredShellCookie(shell: PortalShellValue): void {
  document.cookie = `${PREFERRED_SHELL_COOKIE_NAME}=${shell}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
