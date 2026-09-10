import { describe, expect, it } from 'vitest';

import { resolveBreadcrumbShell } from './resolve-breadcrumb-shell';

describe('resolveBreadcrumbShell', () => {
  it('reads the doctor shell from its path prefix', () => {
    expect(resolveBreadcrumbShell('/doctor')).toBe('doctor');
    expect(resolveBreadcrumbShell('/doctor/patients/abc')).toBe('doctor');
  });

  it('treats every other path as the admin shell', () => {
    expect(resolveBreadcrumbShell('/admin/patients')).toBe('admin');
    expect(resolveBreadcrumbShell('/portal/registrations')).toBe('admin');
    expect(resolveBreadcrumbShell('/doctors')).toBe('admin');
  });

  it('falls back to the admin shell without a path', () => {
    expect(resolveBreadcrumbShell(null)).toBe('admin');
  });
});
