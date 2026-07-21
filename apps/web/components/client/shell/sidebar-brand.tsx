'use client';

import Link from 'next/link';
import { Icon, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@hms/ui';

export function SidebarBrand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg" className="hover:bg-transparent active:bg-transparent">
          <Link href="/admin/dashboard">
            <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Icon name="medical_services" size={20} />
            </span>
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-heading text-lg font-semibold">Saling Jaga</span>
              <span className="truncate text-xs text-muted-foreground">Medical Center</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
