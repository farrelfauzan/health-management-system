'use client';

import Link from 'next/link';
import { Icon, SidebarMenuButton, SidebarMenuItem } from '@hms/ui';

import type { AdminNavItem } from '#lib/shell/nav-items';

type SidebarNavItemProps = {
  item: AdminNavItem;
  label: string;
  isActive: boolean;
};

export function SidebarNavItem({ item, label, isActive }: SidebarNavItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
        className="h-10 gap-4 px-4 font-heading font-medium transition-all duration-150 hover:translate-x-1 data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm data-[active=true]:hover:translate-x-0"
      >
        <Link href={item.href} aria-current={isActive ? 'page' : undefined}>
          <Icon name={item.icon} size={20} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
