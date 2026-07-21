'use client';

import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  useAbility,
} from '@hms/ui';

import { ADMIN_NAV_SECTIONS, type AdminNavSection } from '#lib/shell/nav-items';
import { isRouteActive } from '#lib/shell/active-route';

import { SidebarBrand } from './sidebar-brand';
import { SidebarNavItem } from './sidebar-nav-item';

export function AppSidebar() {
  const pathname = usePathname();
  const ability = useAbility();
  const visibleSections: AdminNavSection[] = ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.ability === null || ability.can(item.ability.action, item.ability.subject),
    ),
  })).filter((section) => section.items.length > 0);
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        {visibleSections.map((section) => (
          <SidebarGroup key={section.label ?? 'main'}>
            {section.label ? (
              <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    item={item}
                    isActive={isRouteActive(pathname, item.href)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
