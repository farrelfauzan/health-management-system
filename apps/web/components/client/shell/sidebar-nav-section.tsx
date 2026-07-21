'use client';

import type { AdminNavItem } from '#lib/shell/nav-items';
import { isRouteActive } from '#lib/shell/active-route';

import { SidebarNavItem } from './sidebar-nav-item';

type SidebarNavSectionProps = {
  label: string | null;
  items: AdminNavItem[];
  pathname: string;
};

export function SidebarNavSection({ label, items, pathname }: SidebarNavSectionProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <p className="mb-2 mt-8 px-4 text-[10px] font-bold uppercase tracking-wider text-outline">
          {label}
        </p>
      ) : null}
      {items.map((item) => (
        <SidebarNavItem key={item.href} item={item} isActive={isRouteActive(pathname, item.href)} />
      ))}
    </div>
  );
}
