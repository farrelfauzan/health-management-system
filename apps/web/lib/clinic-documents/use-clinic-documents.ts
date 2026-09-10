import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { ApiSuccess, ClinicDocumentView } from '@hms/shared-types';

import {
  documentAdminControllerListDocumentsV1,
  getDocumentAdminControllerListDocumentsV1QueryKey,
} from '#lib/api/generated/document-management/document-management';
import type { DocumentAdminControllerListDocumentsV1Params } from '#lib/api/generated/model/documentAdminControllerListDocumentsV1Params';
import { parseApiSuccess } from '#lib/api/response';
import { resolveDocumentIngestState } from '#lib/documents/document-ingest-state';

/** How often to re-check while the worker is still embedding something. */
const INGEST_POLL_INTERVAL_MS = 5_000;

const LOAD_ERROR_MESSAGE = 'Unable to load the clinic corpus.';

type ClinicDocumentsPage = ApiSuccess<ClinicDocumentView[]>;

type ClinicDocumentsQueryKey = ReturnType<
  typeof getDocumentAdminControllerListDocumentsV1QueryKey
>;

function resolveNextCursor(page: ClinicDocumentsPage): string | undefined {
  const nextCursor = page.meta?.nextCursor;
  return typeof nextCursor === 'string' && nextCursor.length > 0 ? nextCursor : undefined;
}

function hasIngestingDocument(pages: ClinicDocumentsPage[]): boolean {
  return pages.some((page) =>
    (page.data ?? []).some(
      (document) => !resolveDocumentIngestState(document.ingestStatus).isAnswerable,
    ),
  );
}

/**
 * The shared clinic corpus — the FAQ and SOP documents the in-app assistant
 * and, from `PCS-T05`, the WhatsApp/Telegram channel answer patients from —
 * one cursor page at a time.
 *
 * Separate from `usePersonalDocuments` rather than a mode of it. The two read
 * different routes with different permission scopes, and the difference is the
 * only thing about them that matters: this one reaches documents every patient
 * can be shown, and collapsing both into one hook with an owner argument would
 * put that distinction in a parameter instead of in a URL.
 *
 * **Cursor-paged rather than fetched whole** (`P19-T15`). The endpoint has
 * always answered with at most twenty rows and a `nextCursor`, and this hook
 * used to ask for one page and read none of that — so a clinic with more than
 * twenty FAQ documents saw the newest twenty and had no way to reach, re-ingest
 * or retire the rest. Bulk upload makes that immediate rather than eventual: a
 * folder of fifteen SOPs pushes fifteen older documents off the only page
 * anybody could see, and newest-first is exactly the order that makes it read
 * as though the upload *replaced* them.
 *
 * **Polling is decided from the data**, as it is for the personal corpus:
 * `PENDING` and `PROCESSING` are states a background worker leaves without
 * telling the browser, so a list that never refetched would show an admin
 * "not answerable yet" for a document that finished a minute ago. Once every
 * row on every loaded page is settled the interval returns `false` and an idle
 * tab goes quiet. A refetch re-walks the cursors from the first page, so a page
 * reached by paging forward keeps updating too.
 */
export function useClinicDocuments(params: DocumentAdminControllerListDocumentsV1Params) {
  const query = useInfiniteQuery<
    ClinicDocumentsPage,
    Error,
    InfiniteData<ClinicDocumentsPage>,
    ClinicDocumentsQueryKey,
    string | undefined
  >({
    queryKey: getDocumentAdminControllerListDocumentsV1QueryKey(params),
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) =>
      parseApiSuccess<ClinicDocumentView[]>(
        await documentAdminControllerListDocumentsV1(
          pageParam ? { ...params, cursor: pageParam } : params,
          signal,
        ),
        LOAD_ERROR_MESSAGE,
      ),
    getNextPageParam: resolveNextCursor,
    retry: false,
    refetchInterval: (currentQuery) => {
      const data = currentQuery.state.data as InfiniteData<ClinicDocumentsPage> | undefined;
      return hasIngestingDocument(data?.pages ?? []) ? INGEST_POLL_INTERVAL_MS : false;
    },
  });
  return { ...query, pages: query.data?.pages ?? [] };
}
