'use client';

import { usePathname } from 'next/navigation';
import { useAbility } from '@hms/ui';

import { ADMIN_NAV_SECTIONS, type AdminNavSection } from '#lib/shell/nav-items';

import { SidebarBrand } from './sidebar-brand';
import { SidebarNavSection } from './sidebar-nav-section';

export function Sidebar() {
  const pathname = usePathname();
  const ability = useAbility();
  const visibleSections: AdminNavSection[] = ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.ability === null || ability.can(item.ability.action, item.ability.subject),
    ),
  }));
  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-sidebar flex-col border-r border-outline-variant bg-surface-container-lowest p-4">
      <SidebarBrand />
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {visibleSections.map((section) => (
          <SidebarNavSection
            key={section.label ?? 'main'}
            label={section.label}
            items={section.items}
            pathname={pathname}
          />
        ))}
      </nav>
    </aside>
  );
}
