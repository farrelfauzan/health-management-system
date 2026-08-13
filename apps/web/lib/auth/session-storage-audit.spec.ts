import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * SJ-9 acceptance: nothing about a session persists across users.
 *
 * A structural check rather than a runtime one, because the failure this
 * guards against is somebody *adding* persistence later — a "remember me"
 * checkbox, a cached patient list in `localStorage` to make a screen feel
 * faster. Neither would break a behavioural test; both would leave the
 * previous user's data on a shared clinic terminal for whoever sits down next.
 *
 * The access token lives in a cookie, which is deliberate and different: the
 * browser drops it on expiry, `clearAccessTokenCookie` drops it on the way
 * out, and it never survives the redirect to `/login`.
 */
const WEB_ROOT = join(import.meta.dirname, '..', '..');

const SCANNED_DIRECTORIES: readonly string[] = ['app', 'components', 'hooks', 'lib'];

const FORBIDDEN_STORAGE_PATTERNS: readonly RegExp[] = [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
];

/**
 * `use-persisted-boolean` keeps UI preferences — sidebar collapsed, and the
 * like. Reviewed and allowed: it holds no session material and no patient
 * data, and a shared terminal remembering that somebody folded the sidebar is
 * not a disclosure. It is listed by path so that adding a *second* persisting
 * hook is a deliberate, diff-visible act rather than something that slips in.
 */
const REVIEWED_EXCEPTIONS: readonly string[] = ['hooks/use-persisted-boolean.ts'];

/**
 * Drops comments before scanning, because this file is looking for *code* that
 * persists things — and the codebase discusses `localStorage` in prose
 * precisely where it explains why it is not used. Matching those explanations
 * would make the audit fail loudest on the files that get it right.
 *
 * Conservative on purpose: block comments go, and so do lines that are
 * entirely a comment, but a trailing `// …` after real code is left alone
 * rather than risk truncating a line at a `//` inside a URL string. A false
 * positive costs a reviewer a minute; a false negative is a patient record
 * left on a shared terminal.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

function collectSourceFiles(directory: string): string[] {
  const absolute = join(WEB_ROOT, directory);
  const entries = readdirSync(absolute, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) {
      // Orval output is regenerated from the OpenAPI contract and contains no
      // storage access by construction.
      return relative.includes(join('lib', 'api', 'generated'))
        ? []
        : collectSourceFiles(relative);
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.spec.ts') || entry.name.endsWith('.spec.tsx')) {
      return [];
    }
    return statSync(join(WEB_ROOT, relative)).isFile() ? [relative] : [];
  });
}

describe('browser storage audit (SJ-9)', () => {
  const sourceFiles = SCANNED_DIRECTORIES.flatMap((directory) => collectSourceFiles(directory));

  it('scans a meaningful number of files, so a broken glob cannot pass silently', () => {
    expect(sourceFiles.length).toBeGreaterThan(100);
  });

  it('persists nothing to localStorage, sessionStorage or IndexedDB', () => {
    const offenders = sourceFiles
      .filter((file) => !REVIEWED_EXCEPTIONS.includes(file))
      .filter((file) => {
        const contents = stripComments(readFileSync(join(WEB_ROOT, file), 'utf8'));
        return FORBIDDEN_STORAGE_PATTERNS.some((pattern) => pattern.test(contents));
      })
      .sort();

    expect(offenders).toEqual([]);
  });

  /** SJ-9 acceptance: no remember-me control exists. */
  it('offers no remember-me on the login form', () => {
    const loginForm = stripComments(
      readFileSync(join(WEB_ROOT, 'components', 'client', 'auth', 'login-form.tsx'), 'utf8'),
    );

    expect(loginForm).not.toMatch(/remember/i);
  });
});
