import { keepPreviousData, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { ApiSuccess, VaultDocumentCategoryValue, VaultDocumentView } from '@hms/shared-types';

import {
  getVaultDocumentControllerListDocumentsV1QueryKey,
  vaultDocumentControllerListDocumentsV1,
} from '#lib/api/generated/document-management/document-management';
import type { VaultDocumentControllerListDocumentsV1Params } from '#lib/api/generated/model/vaultDocumentControllerListDocumentsV1Params';
import { parseApiSuccess } from '#lib/api/response';

export type VaultDocumentsFilters = {
  search?: string;
  vaultCategory?: VaultDocumentCategoryValue;
};

type VaultDocumentsPage = ApiSuccess<VaultDocumentView[]>;

type VaultDocumentsQueryKey = ReturnType<typeof getVaultDocumentControllerListDocumentsV1QueryKey>;

const LOAD_ERROR_MESSAGE = 'Unable to load your documents.';

function resolveNextCursor(page: VaultDocumentsPage): string | undefined {
  const nextCursor = page.meta?.nextCursor;
  return typeof nextCursor === 'string' && nextCursor.length > 0 ? nextCursor : undefined;
}

function buildListParams(filters: VaultDocumentsFilters): VaultDocumentControllerListDocumentsV1Params {
  // The API refuses a blank search term outright rather than treating it as
  // "no filter", so whitespace never reaches the query string.
  const search = filters.search?.trim() ?? '';
  return {
    ...(search.length > 0 ? { search } : {}),
    ...(filters.vaultCategory === undefined ? {} : { vaultCategory: filters.vaultCategory }),
  };
}

/**
 * The signed-in user's own document vault (`P16-T18`), one cursor page at a
 * time.
 *
 * There is no owner parameter, and nothing to pass one to: the API derives
 * the owner from the session, so this hook cannot be pointed at somebody
 * else's vault even by mistake. The filters narrow one vault; they never
 * select which.
 *
 * Cursor-paged rather than fetched whole. A vault that has collected a
 * career's worth of certificates is a hundred rows, and the first page used
 * to be silently all anyone saw. Unlike `usePersonalDocuments`, this one
 * never polls: a vault document is stored and served and has no pipeline to
 * wait on, so there is nothing a refetch could discover.
 */
export function useVaultDocuments(filters: VaultDocumentsFilters = {}) {
  const params = buildListParams(filters);
  const query = useInfiniteQuery<
    VaultDocumentsPage,
    Error,
    InfiniteData<VaultDocumentsPage>,
    VaultDocumentsQueryKey,
    string | undefined
  >({
    queryKey: getVaultDocumentControllerListDocumentsV1QueryKey(params),
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) =>
      parseApiSuccess<VaultDocumentView[]>(
        await vaultDocumentControllerListDocumentsV1(
          pageParam ? { ...params, cursor: pageParam } : params,
          signal,
        ),
        LOAD_ERROR_MESSAGE,
      ),
    getNextPageParam: resolveNextCursor,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return { ...query, pages: query.data?.pages ?? [] };
}
