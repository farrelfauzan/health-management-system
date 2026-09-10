import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { ApiSuccess, PersonalDocumentView } from '@hms/shared-types';

import {
  getPersonalDocumentControllerListDocumentsV1QueryKey,
  personalDocumentControllerListDocumentsV1,
} from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';
import { resolveDocumentIngestState } from '#lib/documents/document-ingest-state';

/** How often to re-check while the worker is still embedding something. */
const INGEST_POLL_INTERVAL_MS = 5_000;

const LOAD_ERROR_MESSAGE = 'Unable to load your knowledge base.';

type PersonalDocumentsPage = ApiSuccess<PersonalDocumentView[]>;

type PersonalDocumentsQueryKey = ReturnType<
  typeof getPersonalDocumentControllerListDocumentsV1QueryKey
>;

function resolveNextCursor(page: PersonalDocumentsPage): string | undefined {
  const nextCursor = page.meta?.nextCursor;
  return typeof nextCursor === 'string' && nextCursor.length > 0 ? nextCursor : undefined;
}

function hasIngestingDocument(pages: PersonalDocumentsPage[]): boolean {
  return pages.some((page) =>
    (page.data ?? []).some(
      (document) => !resolveDocumentIngestState(document.ingestStatus).isAnswerable,
    ),
  );
}

/**
 * The signed-in user's own knowledge base, one cursor page at a time.
 *
 * There is no owner parameter, and nothing to pass one to: the API derives the
 * owner from the session, so this hook cannot be pointed at somebody else's
 * corpus even by mistake.
 *
 * **Cursor-paged rather than fetched whole.** The endpoint has always answered
 * with at most twenty rows and a `nextCursor`, and this hook used to ask for
 * one page and read none of that — so an owner who had uploaded more than
 * twenty documents saw the newest twenty and had no way to reach the rest, nor
 * to re-ingest or delete them. It read as though a new upload had *replaced*
 * the older ones, because newest-first is exactly the order that pushes them
 * off the only page anybody could see.
 *
 * **Polling is decided here rather than by the caller**, from the data itself.
 * `PENDING` and `PROCESSING` are states a background worker leaves without
 * telling the browser, so a list that never refetched would strand an owner on
 * "not answerable yet" for a document that finished a minute ago. Once every
 * row on every loaded page is settled the interval returns `false` and an idle
 * tab goes quiet — which is why this is a function of the cached data rather
 * than a fixed interval, and why the caller does not get to pass one in. A
 * refetch re-walks the cursors from the first page, so a page reached by
 * paging forward keeps updating too.
 */
export function usePersonalDocuments() {
  const query = useInfiniteQuery<
    PersonalDocumentsPage,
    Error,
    InfiniteData<PersonalDocumentsPage>,
    PersonalDocumentsQueryKey,
    string | undefined
  >({
    queryKey: getPersonalDocumentControllerListDocumentsV1QueryKey(),
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) =>
      parseApiSuccess<PersonalDocumentView[]>(
        await personalDocumentControllerListDocumentsV1(
          pageParam ? { cursor: pageParam } : undefined,
          signal,
        ),
        LOAD_ERROR_MESSAGE,
      ),
    getNextPageParam: resolveNextCursor,
    retry: false,
    refetchInterval: (currentQuery) => {
      const data = currentQuery.state.data as InfiniteData<PersonalDocumentsPage> | undefined;
      return hasIngestingDocument(data?.pages ?? []) ? INGEST_POLL_INTERVAL_MS : false;
    },
  });
  return { ...query, pages: query.data?.pages ?? [] };
}
