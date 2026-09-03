'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@hms/ui';

type PortalNavLinkProps = {
  href: string;
  label: string;
};

/**
 * One link in the portal's top bar.
 *
 * A client component only because the active state needs the current path;
 * the bar around it stays a server component. Matching is by prefix so a
 * future detail route under `/portal/documents/…` still shows its section as
 * current rather than leaving the bar with nothing highlighted.
 */
export function PortalNavLink({ href, label }: PortalNavLinkProps) {
  const pathname = usePathname();
  const isCurrent = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isCurrent ? 'bg-primary-container/10 text-primary' : 'text-slate-600 hover:text-slate-900',
      )}
    >
      {label}
    </Link>
  );
}
