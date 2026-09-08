import { buildAppAbility } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { filterNavSections } from './filter-nav-sections';

/**
 * P18-T08. A technician's grants, exactly as `seed.sql` gives them, produce a
 * shell of one entry once the dashboard is dropped the way the admin layout
 * drops it — patients, encounters and billing never render for them.
 */
describe('filterNavSections for a laboratory technician', () => {
  it('leaves only the laboratory entry', () => {
    const ability = buildAppAbility([
      { action: 'read', subject: 'LabTest' },
      { action: 'read', subject: 'LabOrder' },
      { action: 'write', subject: 'LabSpecimen' },
      { action: 'write', subject: 'LabResult' },
      { action: 'verify', subject: 'LabResult' },
      { action: 'read', subject: 'LaboratorySettings' },
      { action: 'read', subject: 'ClinicProfile' },
    ]);

    const sections = filterNavSections(ability, undefined, ['/admin/dashboard']);
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).toEqual(['/admin/laboratory']);
  });
});
