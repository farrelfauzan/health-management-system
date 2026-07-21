import { Fragment } from 'react';
import { Icon, cn } from '@hms/ui';

type PageBreadcrumbsProps = {
  breadcrumbs: string[];
};

export function PageBreadcrumbs({ breadcrumbs }: PageBreadcrumbsProps) {
  if (breadcrumbs.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 font-heading text-sm font-medium text-outline"
    >
      {breadcrumbs.map((crumb, index) => (
        <Fragment key={crumb}>
          {index > 0 ? <Icon name="chevron_right" size={14} /> : null}
          <span className={cn(index === breadcrumbs.length - 1 && 'font-bold text-primary')}>
            {crumb}
          </span>
        </Fragment>
      ))}
    </nav>
  );
}
