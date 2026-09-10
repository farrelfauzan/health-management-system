import Link from 'next/link';
import { BreadcrumbLink, BreadcrumbPage, cn } from '@hms/ui';

import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

type PageBreadcrumbLabelProps = {
  item: BreadcrumbTrailItem;
  isCurrent: boolean;
};

/**
 * A label wide enough for a name, not for a paragraph: a long patient name or
 * document title is cut with an ellipsis on a phone and shown whole from `sm`.
 */
const LABEL_CLASS_NAME = 'inline-block max-w-[12rem] truncate align-bottom sm:max-w-none';

/**
 * The text of one crumb: the current page announced as such and not a link;
 * a parent as a `next/link` injected through the kit's `asChild` slot, since
 * `@hms/ui` has no router; a grouping that has no page as plain text.
 */
export function PageBreadcrumbLabel({ item, isCurrent }: PageBreadcrumbLabelProps) {
  if (isCurrent) {
    return (
      <BreadcrumbPage className={cn(LABEL_CLASS_NAME, 'font-bold text-primary')}>
        {item.label}
      </BreadcrumbPage>
    );
  }
  if (item.href === undefined) {
    return <span className={LABEL_CLASS_NAME}>{item.label}</span>;
  }
  return (
    <BreadcrumbLink asChild className={cn(LABEL_CLASS_NAME, 'hover:text-primary')}>
      <Link href={item.href}>{item.label}</Link>
    </BreadcrumbLink>
  );
}
