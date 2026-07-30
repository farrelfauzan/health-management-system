import { buildAppAbility } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { filterNavSections } from './filter-nav-sections';

describe('filterNavSections', () => {
  it('can hide route-level shell entries that have no ability requirement', () => {
    const ability = buildAppAbility([
      { action: 'read', subject: 'Medication' },
      { action: 'read', subject: 'Inventory' },
    ]);

    const sections = filterNavSections(ability, undefined, ['/admin/dashboard']);
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).toEqual(['/admin/pharmacy']);
  });

  it('keeps the dashboard for the normal admin shell', () => {
    const ability = buildAppAbility([{ action: 'manage', subject: 'all' }]);

    const sections = filterNavSections(ability);
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).toContain('/admin/dashboard');
  });
});
