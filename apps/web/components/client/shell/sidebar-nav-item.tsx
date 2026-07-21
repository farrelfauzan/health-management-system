'use client';

import Link from 'next/link';
import { Icon, cn } from '@hms/ui';

import type { AdminNavItem } from '#lib/shell/nav-items';

type SidebarNavItemProps = {
  item: AdminNavItem;
  isActive: boolean;
};

export function SidebarNavItem({ item, isActive }: SidebarNavItemProps) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-4 rounded-lg px-4 py-2 font-heading text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-primary-container font-bold text-on-primary-container shadow-sm'
          : 'text-on-surface-variant hover:translate-x-1 hover:bg-surface-container-low',
      )}
    >
      <Icon name={item.icon} size={20} />
      <span>{item.label}</span>
    </Link>
  );
}
