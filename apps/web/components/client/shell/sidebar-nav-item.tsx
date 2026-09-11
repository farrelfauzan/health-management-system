'use client';

import Link from 'next/link';
import { cn, Icon, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from '@hms/ui';

import type { AdminNavItem } from '#lib/shell/nav-items';
import { useNavBadge } from '#lib/shell/use-nav-badge';

type SidebarNavItemProps = {
  item: AdminNavItem;
  label: string;
  isActive: boolean;
};

export function SidebarNavItem({ item, label, isActive }: SidebarNavItemProps) {
  const badge = useNavBadge(item.badgeKey);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
        className={cn(
          'h-10 gap-4 px-4 font-heading font-medium transition-all duration-150 hover:translate-x-1 data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm data-[active=true]:hover:translate-x-0',
          // P19-T01. On the icon rail the kit forces a 2rem square with 0.5rem
          // padding, which leaves 1rem for a 1.25rem glyph; trim the padding so
          // the icon is not clipped, and drop the hover nudge that would shove
          // it into the rail's edge.
          'group-data-[collapsible=icon]:p-1.5! group-data-[collapsible=icon]:hover:translate-x-0',
        )}
      >
        <Link href={item.href} aria-current={isActive ? 'page' : undefined}>
          <Icon name={item.icon} size={20} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {badge === null ? null : (
        <SidebarMenuBadge
          aria-label={badge.label}
          // The kit's top-1.5 offset assumes its own default h-8 button; this
          // row is h-10, so center the badge on the row height instead. The
          // kit hides badges on the rail; a handoff count is the one thing
          // worth keeping, so it shrinks into the icon's corner instead.
          className="top-1/2 -translate-y-1/2 group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:translate-y-0 group-data-[collapsible=icon]:px-0.5 group-data-[collapsible=icon]:text-[10px] group-data-[collapsible=icon]:bg-sidebar-primary group-data-[collapsible=icon]:text-sidebar-primary-foreground"
        >
          <span aria-hidden="true">{badge.count}</span>
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}
