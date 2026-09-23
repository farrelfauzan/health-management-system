import { buildAppAbility } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { filterNavSections } from './filter-nav-sections';

/**
 * P22-T03. A role holding `encounter.record-vitals:any` and no
 * `encounter.read` still gets the Encounters entry: it is how triage finds the
 * visit it has to measure, and the API lists visits for either key.
 */
describe('filterNavSections for a triage role', () => {
  it('shows the encounters entry for record-vitals alone', () => {
    const ability = buildAppAbility([{ action: 'record-vitals', subject: 'Encounter' }]);

    const sections = filterNavSections(ability, undefined, ['/admin/dashboard']);
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).toContain('/admin/encounters');
  });
});
