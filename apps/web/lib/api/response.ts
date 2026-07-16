import type { ApiError, ApiSuccess } from '@hms/shared-types';

type HttpResponse = {
  status: number;
  data: unknown;
};

export function parseApiSuccess<T>(response: HttpResponse, fallback: string): ApiSuccess<T> {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(parseApiErrorMessage(response.data, fallback));
  }

  if (typeof response.data !== 'object' || response.data === null || !('data' in response.data)) {
    throw new Error('Unexpected API response envelope');
  }

  return response.data as ApiSuccess<T>;
}

export function tryParseApiSuccess<T>(
  response: HttpResponse | undefined,
  fallback: string,
): { envelope?: ApiSuccess<T>; error?: string } {
  if (!response) {
    return {};
  }

  try {
    return {
      envelope: parseApiSuccess<T>(response, fallback),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : fallback,
    };
  }
}

function parseApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return fallback;
  }

  const apiError = payload as Partial<ApiError> & { message?: string };

  return apiError.error?.message ?? apiError.message ?? fallback;
}
