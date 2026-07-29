import type { AppAbility } from '@hms/ui';

import { ADMIN_NAV_SECTIONS, type AdminNavSection } from '#lib/shell/nav-items';

export function filterNavSections(
  ability: AppAbility,
  sections: AdminNavSection[] = ADMIN_NAV_SECTIONS,
): AdminNavSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.ability === null) {
        return true;
      }
      const requirements = Array.isArray(item.ability) ? item.ability : [item.ability];
      return requirements.some((requirement) =>
        ability.can(requirement.action, requirement.subject),
      );
    }),
  })).filter((section) => section.items.length > 0);
}
