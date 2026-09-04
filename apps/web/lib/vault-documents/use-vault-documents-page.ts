import { useState } from 'react';

import { useDebouncedValue } from '#hooks/use-debounced-value';
import {
  useVaultDocuments,
  type VaultDocumentsFilters,
} from '#lib/vault-documents/use-vault-documents';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * One visible page of the owner's vault, over the cursor-fed query.
 *
 * The API only ever hands out "the page after this one", so there is no page
 * number to jump to and no total to show. What an owner gets instead is a
 * pointer into the pages already fetched: moving back is instant and moving
 * forward fetches only when the next page has not been seen yet. A table
 * that grows by "load more" would have been the easier build, but a table of
 * a hundred rows is a thing to page through, not to scroll.
 *
 * The search term is debounced here rather than in the input so the filter
 * bar can stay a plain controlled field and page one is shown from the first
 * keystroke, before the narrower result arrives.
 */
export function useVaultDocumentsPage(filters: VaultDocumentsFilters) {
  const [pageIndex, setPageIndex] = useState(0);
  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);
  const query = useVaultDocuments({ ...filters, search: debouncedSearch });
  const lastLoadedIndex = Math.max(query.pages.length - 1, 0);
  const currentIndex = Math.min(pageIndex, lastLoadedIndex);
  const rows = query.pages[currentIndex]?.data ?? [];
  const hasNextPage = currentIndex + 1 < query.pages.length || query.hasNextPage;

  async function goToNextPage(): Promise<void> {
    if (currentIndex + 1 >= query.pages.length) {
      const result = await query.fetchNextPage();
      if (result.isError) {
        return;
      }
    }
    setPageIndex(currentIndex + 1);
  }

  function goToPreviousPage(): void {
    setPageIndex(Math.max(currentIndex - 1, 0));
  }

  function resetPage(): void {
    setPageIndex(0);
  }

  return {
    ...query,
    rows,
    pageNumber: currentIndex + 1,
    hasPreviousPage: currentIndex > 0,
    hasNextPage,
    goToNextPage,
    goToPreviousPage,
    resetPage,
  };
}
