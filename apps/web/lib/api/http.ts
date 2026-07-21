import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

import {
  clearAccessTokenCookie,
  readAccessTokenFromBrowserCookie,
} from '#lib/auth/access-token-cookie';
import { clearRefreshTokenCookie } from '#lib/auth/refresh-token-cookie';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

const LOGIN_PATH = '/login';

function isAuthRequestUrl(url: string | undefined): boolean {
  return url?.includes('/auth/') ?? false;
}

function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === LOGIN_PATH) {
    return;
  }

  window.location.assign(LOGIN_PATH);
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

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !isAuthRequestUrl(error.config?.url)) {
      clearAccessTokenCookie();
      clearRefreshTokenCookie();
      redirectToLogin();
    }

    return Promise.reject(error);
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
