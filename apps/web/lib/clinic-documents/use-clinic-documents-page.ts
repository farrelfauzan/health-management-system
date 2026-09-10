import { useState } from 'react';
import type { ApiSuccess, ClinicDocumentView } from '@hms/shared-types';

import { useClinicDocuments } from '#lib/clinic-documents/use-clinic-documents';
import type { DocumentAdminControllerListDocumentsV1Params } from '#lib/api/generated/model/documentAdminControllerListDocumentsV1Params';

/**
 * The last page that still has rows on it, or page one when none of them do.
 *
 * This is what keeps a retire from stranding an admin. Retiring the only
 * document on the last page leaves that page loaded and empty after the
 * refetch, and a shorter list can drop the page entirely; either way the
 * pointer the admin is holding no longer names anything. Clamping to this
 * index walks them back to the last page that does.
 */
function resolveLastPopulatedIndex(pages: ApiSuccess<ClinicDocumentView[]>[]): number {
  return pages.reduce((found, page, index) => ((page.data ?? []).length > 0 ? index : found), 0);
}

/**
 * One visible page of the shared clinic corpus, over the cursor-fed query.
 *
 * The API only ever hands out "the page after this one", so there is no page
 * number to jump to and no total to show. What an admin gets instead is a
 * pointer into the pages already fetched: moving back is instant and moving
 * forward fetches only when the next page has not been seen yet.
 *
 * The same job `usePersonalDocumentsPage` does over the same cursor-paginated
 * document API, kept separate for the reason the two queries are separate: the
 * filters belong to this list and not to that one, and a change to them starts
 * a different query whose pages this pointer must not be carried across. The
 * panel resets the pointer when a filter moves; the clamp here catches the
 * cases nobody presses a button for.
 */
export function useClinicDocumentsPage(params: DocumentAdminControllerListDocumentsV1Params) {
  const [pageIndex, setPageIndex] = useState(0);
  const query = useClinicDocuments(params);
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
