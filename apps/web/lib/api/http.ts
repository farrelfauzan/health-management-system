import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiSuccess, RefreshedAuthTokens } from '@hms/shared-types';

import {
  clearAccessTokenCookie,
  readAccessTokenFromBrowserCookie,
  setAccessTokenCookie,
} from '#lib/auth/access-token-cookie';
import { mfaTicketStore } from '#lib/auth/mfa-ticket-store';


export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

const LOGIN_PATH = '/login';

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  hasRetriedRefresh?: boolean;
};

let refreshRequest: Promise<string> | null = null;

function isAuthRequestUrl(url: string | undefined): boolean {
  return url?.includes('/auth/') ?? false;
}

function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === LOGIN_PATH) {
    return;
  }

  window.location.assign(LOGIN_PATH);
}

function clearSessionAndRedirect(): void {
  // Only the access-token cookie is ours to clear. The refresh token is
  // `httpOnly` and path-scoped to the API (SJ-6), so this tier cannot see it
  // and must not pretend to — the server drops it on logout or on the reuse
  // check that killed the family.
  clearAccessTokenCookie();
  redirectToLogin();
}

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}`,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  // The two-phase login's ticket wins on the three MFA routes (SJ-8). It has
  // to: a user whose login was just refused for want of a second factor may
  // still hold a stale access-token cookie, and sending that instead would
  // present the one credential the server is guaranteed to reject.
  const ticket = mfaTicketStore.resolveFor(config.url);
  const token = ticket ?? readAccessTokenFromBrowserCookie();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Exchanges the refresh cookie for a new access token (SJ-6).
 *
 * There is no token to send: the browser attaches the `httpOnly` cookie to
 * this one path by itself, which is why the request body is empty and
 * `withCredentials` is not optional. The single-flight wrapper below matters
 * more than it used to — the server now treats a second rotation of the same
 * token outside its grace window as theft and kills the whole family, so two
 * concurrent refreshes racing past each other would log the user out.
 */
async function executeTokenRefresh(): Promise<string> {
  const response = await apiClient.post<ApiSuccess<RefreshedAuthTokens>>(
    '/api/v1/auth/refresh',
    {},
  );
  const tokens = response.data.data;
  setAccessTokenCookie(tokens.accessToken);
  return tokens.accessToken;
}

function getRefreshedAccessToken(): Promise<string> {
  if (refreshRequest) {
    return refreshRequest;
  }
  refreshRequest = executeTokenRefresh().finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError): Promise<unknown> => {
    const requestConfig = error.config as RetriableRequestConfig | undefined;
    const canRefresh =
      error.response?.status === 401 &&
      requestConfig !== undefined &&
      !requestConfig.hasRetriedRefresh &&
      !isAuthRequestUrl(requestConfig.url);
    if (!canRefresh) {
      return Promise.reject(error);
    }
    requestConfig.hasRetriedRefresh = true;
    try {
      const accessToken = await getRefreshedAccessToken();
      requestConfig.headers.Authorization = `Bearer ${accessToken}`;
      return await apiClient.request(requestConfig);
    } catch {
      clearSessionAndRedirect();
      return Promise.reject(error);
    }
  },
);

export const orvalAxiosMutator = async <T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; status: number; headers: Record<string, unknown> }> => {
  const response = await apiClient.request<T>(config);

  return {
    data: response.data,
    status: response.status,
    headers: response.headers as Record<string, unknown>,
  };
};

export type ApiErrorType<ErrorData> = AxiosError<ErrorData>;
