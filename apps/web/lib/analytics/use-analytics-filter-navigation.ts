import { usePathname, useRouter } from 'next/navigation';

import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { toAnalyticsFilterSearchParams } from '#lib/analytics/to-analytics-filter-search-params';

/**
 * Writes a filter change into the URL, so a reload or a shared link shows the
 * same view. `replace`, not `push`: stepping through six presets should not
 * leave six entries in the back button.
 */
export function useAnalyticsFilterNavigation(): (next: AnalyticsFilterState) => void {
  const router = useRouter();
  const pathname = usePathname();
  return (next) => {
    const query = toAnalyticsFilterSearchParams(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}
