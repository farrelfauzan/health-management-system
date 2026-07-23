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
import {
  clearRefreshTokenCookie,
  readRefreshTokenFromBrowserCookie,
  setRefreshTokenCookie,
} from '#lib/auth/refresh-token-cookie';

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
  clearAccessTokenCookie();
  clearRefreshTokenCookie();
  redirectToLogin();
}

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}`,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = readAccessTokenFromBrowserCookie();

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

async function executeTokenRefresh(): Promise<string> {
  const refreshToken = readRefreshTokenFromBrowserCookie();
  if (!refreshToken) {
    throw new Error('Refresh token is unavailable');
  }
  const response = await apiClient.post<ApiSuccess<RefreshedAuthTokens>>('/api/v1/auth/refresh', {
    refreshToken,
  });
  const tokens = response.data.data;
  setAccessTokenCookie(tokens.accessToken);
  setRefreshTokenCookie(tokens.refreshToken);
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
