import type { ReactNode } from 'react';
import { cn } from '@hms/ui';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
            {breadcrumbs.join(' / ')}
          </nav>
        ) : null}
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
