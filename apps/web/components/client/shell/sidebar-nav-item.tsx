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
          'h-10 justify-between gap-4 px-4 font-heading font-medium transition-all duration-150 hover:translate-x-1 data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm data-[active=true]:hover:translate-x-0',
          // P19-T01. On the icon rail the kit forces a 2rem square with 0.5rem
          // padding, which leaves 1rem for a 1.25rem glyph; trim the padding so
          // the icon is not clipped, and drop the hover nudge that would shove
          // it into the rail's edge.
          'group-data-[collapsible=icon]:p-1.5! group-data-[collapsible=icon]:hover:translate-x-0',
        )}
      >
        <Link href={item.href} aria-current={isActive ? 'page' : undefined}>
          <span className="flex items-center gap-4 overflow-hidden">
            <Icon name={item.icon} size={20} />
            <span className="truncate">{label}</span>
          </span>
          {badge === null ? null : (
            <SidebarMenuBadge
              aria-label={badge.label}
              // Flows between the label and the row's end instead of
              // overlaying it, so it never has to be nudged back into place
              // when the row's height or the sections above it change.
              className={cn(
                'static shrink-0',
                isActive
                  ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground'
                  : 'bg-sidebar-accent text-sidebar-accent-foreground',
                // The kit hides badges on the rail; a handoff count is the
                // one thing worth keeping, so it shrinks into the icon's
                // corner instead.
                'group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:px-0.5 group-data-[collapsible=icon]:text-[10px] group-data-[collapsible=icon]:bg-sidebar-primary group-data-[collapsible=icon]:text-sidebar-primary-foreground',
              )}
            >
              <span aria-hidden="true">{badge.count}</span>
            </SidebarMenuBadge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
