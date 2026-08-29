import {
  createExpandedRowModel,
  rowExpandingFeature,
  tableFeatures,
} from '@tanstack/react-table';

/**
 * The only TanStack Table features the org chart needs (SJ-90).
 *
 * v9 is opt-in per feature rather than v8's all-in table instance, so this list
 * is also the statement of what the chart deliberately does *not* do: no
 * sorting (the order is `sortOrder` then name, decided by the API and meaningful
 * to the clinic), no filtering or pagination (the tree arrives whole, and a page
 * boundary would cut branches off their parents), no row selection.
 *
 * Declared at module scope because `Row` is generic over the feature set, so
 * every component that types a row derives it from this const.
 */
export const organizationTableFeatures = tableFeatures({
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
});
