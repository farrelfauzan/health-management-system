import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

import {
  clearAccessTokenCookie,
  readAccessTokenFromBrowserCookie,
} from '#lib/auth/access-token-cookie';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
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
    if (error.response?.status === 401) {
      clearAccessTokenCookie();
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
