import type { AppAbility } from '@hms/ui';

import { ADMIN_NAV_SECTIONS, type AdminNavSection } from '#lib/shell/nav-items';

export function filterNavSections(ability: AppAbility): AdminNavSection[] {
  return ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.ability === null || ability.can(item.ability.action, item.ability.subject),
    ),
  })).filter((section) => section.items.length > 0);
}
