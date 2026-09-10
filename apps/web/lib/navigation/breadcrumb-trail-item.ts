/**
 * One segment of a page's breadcrumb trail (SJ-161). A segment with an
 * `href` is a parent the reader can go back to; one without is either the
 * current page (always the last segment) or a grouping that has no page of
 * its own. Named "trail item" rather than "breadcrumb item" so it does not
 * collide with the kit's `BreadcrumbItem` list element.
 */
export type BreadcrumbTrailItem = {
  label: string;
  href?: string;
};
