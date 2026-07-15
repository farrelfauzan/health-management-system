import { useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import type { ApiSuccess } from '@hms/shared-types';

import { parseApiSuccess } from '#lib/api/response';

type HttpResponse = {
  status: number;
  data: unknown;
};

type UseApiQueryParams<TData, TKey extends QueryKey = QueryKey> = {
  queryKey: TKey;
  queryFn: (signal?: AbortSignal) => Promise<HttpResponse>;
  errorMessage: string;
  enabled?: boolean;
  options?: Omit<UseQueryOptions<ApiSuccess<TData>, Error, ApiSuccess<TData>, TKey>, 'queryKey' | 'queryFn' | 'enabled'>;
};

export function useApiQuery<TData, TKey extends QueryKey = QueryKey>({
  queryKey,
  queryFn,
  errorMessage,
  enabled = true,
  options,
}: UseApiQueryParams<TData, TKey>) {
  const query = useQuery<ApiSuccess<TData>, Error, ApiSuccess<TData>, TKey>({
    queryKey,
    queryFn: async ({ signal }) => parseApiSuccess<TData>(await queryFn(signal), errorMessage),
    enabled,
    ...options,
  });

  return {
    ...query,
    envelope: query.data,
    data: query.data?.data,
    meta: query.data?.meta,
    message: query.data?.message,
  };
}
