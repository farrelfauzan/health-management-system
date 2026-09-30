import { buildAppAbility, ADMIN_PORTAL_ADMIN_RULES } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { DOCTOR_NAV_SECTIONS } from './doctor-nav-items';
import { filterNavSections } from './filter-nav-sections';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

/** P29-T01. The "Analitik" group shows each role the dashboards it may read. */
describe('filterNavSections — analytics', () => {
  function listAnalyticsHrefs(permissions: string[]): string[] {
    const ability = buildAppAbility(resolveAppAbilityRules({ permissions }));
    return filterNavSections(ability)
      .filter((section) => section.labelKey === 'analytics')
      .flatMap((section) => section.items.map((item) => item.href));
  }

  it('shows the pharmacist the pharmacy dashboard only', () => {
    expect(listAnalyticsHrefs(['analytics.read-pharmacy:any'])).toEqual([
      '/admin/analytics/pharmacy',
    ]);
  });

  it('shows the operations key both operations and reporting status', () => {
    expect(listAnalyticsHrefs(['analytics.read-operations:any'])).toEqual([
      '/admin/analytics/operations',
      '/admin/analytics/reporting',
    ]);
  });

  it('drops the whole group for a clinician holding only their own practice', () => {
    expect(listAnalyticsHrefs(['analytics.read-practice:own'])).toEqual([]);
  });

  it('shows the ADMIN fallback preset all six dashboards', () => {
    const ability = buildAppAbility(ADMIN_PORTAL_ADMIN_RULES);
    const hrefs = filterNavSections(ability)
      .filter((section) => section.labelKey === 'analytics')
      .flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).toHaveLength(6);
  });

  it('hides a dashboard whose feature is switched off', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({ permissions: ['analytics.read-lab:any'] }),
    );

    const sections = filterNavSections(ability, undefined, ['/admin/analytics/laboratory']);

    expect(sections.some((section) => section.labelKey === 'analytics')).toBe(false);
  });

  it('shows a clinician "My practice" in the doctor shell, and a pharmacist nothing there', () => {
    function listDoctorAnalyticsHrefs(permissions: string[]): string[] {
      const ability = buildAppAbility(resolveAppAbilityRules({ permissions }));
      return filterNavSections(ability, DOCTOR_NAV_SECTIONS)
        .filter((section) => section.labelKey === 'analytics')
        .flatMap((section) => section.items.map((item) => item.href));
    }

    expect(listDoctorAnalyticsHrefs(['analytics.read-practice:own'])).toEqual([
      '/doctor/analytics',
    ]);
    expect(listDoctorAnalyticsHrefs(['analytics.read-pharmacy:any'])).toEqual([]);
  });
});
