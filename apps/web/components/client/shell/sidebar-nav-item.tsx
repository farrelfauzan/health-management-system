'use client';

import Link from 'next/link';
import { Icon, SidebarMenuButton, SidebarMenuItem } from '@hms/ui';

import type { AdminNavItem } from '#lib/shell/nav-items';

type SidebarNavItemProps = {
  item: AdminNavItem;
  isActive: boolean;
};

export function SidebarNavItem({ item, isActive }: SidebarNavItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.label}
        className="h-9 gap-3 px-3 font-heading font-medium data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm"
      >
        <Link href={item.href} aria-current={isActive ? 'page' : undefined}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
