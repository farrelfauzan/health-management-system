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
} from '@hms/ui';

import type { AdminNavSection } from '#lib/shell/nav-items';
import { isRouteActive } from '#lib/shell/active-route';

import { SidebarBrand } from './sidebar-brand';
import { SidebarNavItem } from './sidebar-nav-item';

type AppSidebarProps = {
  sections: AdminNavSection[];
  homeHref?: string;
};

export function AppSidebar({ sections, homeHref }: AppSidebarProps) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarBrand homeHref={homeHref} />
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label ?? 'main'} className={section.label ? 'mt-2' : undefined}>
            {section.label ? (
              <SidebarGroupLabel className="px-4 text-[10px] font-bold uppercase tracking-wider text-outline">
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
