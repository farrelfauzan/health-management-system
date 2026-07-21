'use client';

import Link from 'next/link';
import { Icon } from '@hms/ui';

export function SidebarBrand() {
  return (
    <Link href="/admin/dashboard" className="mb-8 flex items-center gap-2 px-1">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon name="medical_services" size={20} />
      </span>
      <span className="flex flex-col">
        <span className="font-heading text-lg font-semibold leading-tight text-on-surface">
          Saling Jaga
        </span>
        <span className="-mt-0.5 text-xs text-on-surface-variant">Medical Center</span>
      </span>
    </Link>
  );
}
