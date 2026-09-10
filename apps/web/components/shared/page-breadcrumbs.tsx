import { Breadcrumb, BreadcrumbList } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PageBreadcrumbSegment } from '#components/shared/page-breadcrumb-segment';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

type PageBreadcrumbsProps = {
  items: BreadcrumbTrailItem[];
};

/**
 * Past this many segments the trail no longer fits a phone, and the middle
 * folds into an ellipsis below the `sm` breakpoint. Three is root, section,
 * page: the deepest trail that still reads in full on a narrow screen.
 */
const COLLAPSE_ABOVE_SEGMENTS = 3;

/**
 * The page's trail (SJ-161): every segment but the last is a link back up
 * the tree, the last is the page itself and is announced as such. Segments
 * hidden by the responsive collapse stay in the DOM, so a screen reader still
 * hears the whole trail.
 */
export function PageBreadcrumbs({ items }: PageBreadcrumbsProps) {
  const t = useTranslations('shared.accessibility');
  if (items.length === 0) {
    return null;
  }
  const isCollapsible = items.length > COLLAPSE_ABOVE_SEGMENTS;
  return (
    <Breadcrumb aria-label={t('breadcrumb')}>
      <BreadcrumbList className="font-heading text-sm font-medium text-outline">
        {items.map((item, index) => (
          <PageBreadcrumbSegment
            key={`${index}-${item.label}`}
            item={item}
            index={index}
            count={items.length}
            isCollapsible={isCollapsible}
          />
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
