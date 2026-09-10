import { useState } from 'react';
import type { ApiSuccess, PersonalDocumentView } from '@hms/shared-types';

import { usePersonalDocuments } from '#lib/personal-documents/use-personal-documents';

/**
 * The last page that still has rows on it, or page one when none of them do.
 *
 * This is what keeps a delete from stranding its owner. Deleting the only
 * document on the last page leaves that page loaded and empty after the
 * refetch, and a shorter list can drop the page entirely; either way the
 * pointer the owner is holding no longer names anything. Clamping to this
 * index walks them back to the last page that does.
 */
function resolveLastPopulatedIndex(pages: ApiSuccess<PersonalDocumentView[]>[]): number {
  return pages.reduce((found, page, index) => ((page.data ?? []).length > 0 ? index : found), 0);
}

/**
 * One visible page of the owner's knowledge base, over the cursor-fed query.
 *
 * The API only ever hands out "the page after this one", so there is no page
 * number to jump to and no total to show. What an owner gets instead is a
 * pointer into the pages already fetched: moving back is instant and moving
 * forward fetches only when the next page has not been seen yet.
 *
 * Modelled on `useVaultDocumentsPage`, which does the same job over the same
 * cursor-paginated document API. It is not shared with it because the two
 * differ in what they page over: a vault page is narrowed by filters that must
 * reset the pointer, and this one polls while an ingest is outstanding.
 */
export function usePersonalDocumentsPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const query = usePersonalDocuments();
  const currentIndex = Math.min(pageIndex, resolveLastPopulatedIndex(query.pages));
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
