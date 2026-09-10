'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@hms/ui';

import { FACILITY_CONFIG } from '#lib/facility/facility-config';

import { SidebarBrandToggle } from './sidebar-brand-toggle';

type SidebarBrandProps = {
  homeHref?: string;
};

export function SidebarBrand({ homeHref = '/admin/dashboard' }: SidebarBrandProps) {
  const t = useTranslations('authShell.shell.brand');
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/*
          P19-T01. `pr-10` keeps the name clear of the collapse control that
          appears on hover, so nothing shifts when it does. On the icon rail
          the kit zeroes the padding and the row shrinks to the 2rem mark;
          the text is clipped by the button's overflow, so neither locale can
          push the row wider than the rail.
        */}
        <SidebarMenuButton
          asChild
          size="lg"
          className="pr-10 hover:bg-transparent active:bg-transparent"
        >
          <Link href={homeHref}>
            <Image
              src="/saling-jaga-mark.png"
              alt={t('logoAlt', { facilityName: FACILITY_CONFIG.name })}
              width={32}
              height={32}
              priority
              className="aspect-square size-8 shrink-0 object-contain"
            />
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-heading text-lg font-semibold">
                {FACILITY_CONFIG.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">{t('facilityType')}</span>
            </span>
          </Link>
        </SidebarMenuButton>
        <SidebarBrandToggle />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
