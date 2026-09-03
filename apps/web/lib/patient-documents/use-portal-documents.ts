import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { ApiSuccess, PortalDocumentView } from '@hms/shared-types';

import {
  getPortalDocumentControllerListPortalDocumentsV1QueryKey,
  portalDocumentControllerListPortalDocumentsV1,
} from '#lib/api/generated/document-management/document-management';
import type { PortalDocumentControllerListPortalDocumentsV1Category } from '#lib/api/generated/model/portalDocumentControllerListPortalDocumentsV1Category';
import { parseApiSuccess } from '#lib/api/response';

type PortalDocumentsPage = ApiSuccess<PortalDocumentView[]>;

type PortalDocumentsQueryKey = ReturnType<
  typeof getPortalDocumentControllerListPortalDocumentsV1QueryKey
>;

const LOAD_ERROR_MESSAGE = 'Unable to load your documents.';

function resolveNextCursor(page: PortalDocumentsPage): string | undefined {
  const nextCursor = page.meta?.nextCursor;
  return typeof nextCursor === 'string' && nextCursor.length > 0 ? nextCursor : undefined;
}

/**
 * The patient's own released documents (FR-E2-13).
 *
 * The route resolves the patient from the caller's identity — there is no
 * patient id to pass and no request shape that names another one — so this
 * hook takes only a category filter. An unreleased document answers 404 rather
 * than 403 on this surface, so nothing here distinguishes "not yours" from
 * "not released yet".
 *
 * Cursor-paged for the same reason the staff list is: a set that grows while
 * someone is scrolling it must not show a row twice or skip one, which is what
 * an offset page does.
 */
export function usePortalDocuments(
  category?: PortalDocumentControllerListPortalDocumentsV1Category,
) {
  const params = category === undefined ? {} : { category };
  const query = useInfiniteQuery<
    PortalDocumentsPage,
    Error,
    InfiniteData<PortalDocumentsPage>,
    PortalDocumentsQueryKey,
    string | undefined
  >({
    queryKey: getPortalDocumentControllerListPortalDocumentsV1QueryKey(params),
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) =>
      parseApiSuccess<PortalDocumentView[]>(
        await portalDocumentControllerListPortalDocumentsV1(
          pageParam ? { ...params, cursor: pageParam } : params,
          signal,
        ),
        LOAD_ERROR_MESSAGE,
      ),
    getNextPageParam: resolveNextCursor,
    retry: false,
  });
  return {
    ...query,
    documents: query.data?.pages.flatMap((page) => page.data) ?? [],
  };
}
