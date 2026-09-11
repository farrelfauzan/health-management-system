import { describe, expect, it } from 'vitest';

import { resolveSafeCompletionNext } from '#lib/doctor-profile/resolve-safe-completion-next';

describe('resolveSafeCompletionNext (P20-T02)', () => {
  it('returns to the doctor-shell page the doctor was heading for, query included', () => {
    expect(resolveSafeCompletionNext('/doctor/encounters?tab=today')).toBe(
      '/doctor/encounters?tab=today',
    );
  });

  it.each([
    ['nothing at all', undefined],
    ['an empty value', ''],
    ['another origin', '//evil.test/doctor/x'],
    ['an absolute URL', 'https://evil.test/doctor/dashboard'],
    ['a backslash trick', '/doctor/\\evil.test'],
    ['the admin shell', '/admin/dashboard'],
    ['the completion screen itself', '/doctor/complete-profile'],
  ])('falls back to the dashboard for %s', (_label, next) => {
    expect(resolveSafeCompletionNext(next)).toBe('/doctor/dashboard');
  });
});
