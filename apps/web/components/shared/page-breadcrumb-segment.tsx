import { BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbSeparator, cn } from '@hms/ui';

import { PageBreadcrumbLabel } from '#components/shared/page-breadcrumb-label';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

type PageBreadcrumbSegmentProps = {
  item: BreadcrumbTrailItem;
  index: number;
  count: number;
  /** Whether the trail is long enough that its middle folds away on a phone. */
  isCollapsible: boolean;
};

/**
 * One crumb with the separator that precedes it. In a collapsible trail the
 * middle segments (everything but the first and last) hide below `sm`, and an
 * ellipsis stands in for all of them once, in front of the first one. The
 * separators between two hidden segments hide with them; the one in front of
 * the first hidden segment stays, because on a phone it sits between the root
 * and the ellipsis.
 */
export function PageBreadcrumbSegment({
  item,
  index,
  count,
  isCollapsible,
}: PageBreadcrumbSegmentProps) {
  const isFirst = index === 0;
  const isLast = index === count - 1;
  const isCollapsed = isCollapsible && !isFirst && !isLast;
  const isSeparatorCollapsed = isCollapsed && index > 1;
  const hasEllipsis = isCollapsible && index === 1;
  return (
    <>
      {isFirst ? null : (
        <BreadcrumbSeparator className={cn(isSeparatorCollapsed && 'hidden sm:block')} />
      )}
      {hasEllipsis ? (
        <BreadcrumbItem className="sm:hidden" data-testid="breadcrumb-ellipsis">
          <BreadcrumbEllipsis className="size-auto" />
        </BreadcrumbItem>
      ) : null}
      <BreadcrumbItem className={cn(isCollapsed && 'hidden sm:inline-flex')}>
        <PageBreadcrumbLabel item={item} isCurrent={isLast} />
      </BreadcrumbItem>
    </>
  );
}
