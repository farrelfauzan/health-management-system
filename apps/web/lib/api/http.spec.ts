import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '#lib/api/http';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  readAccessTokenFromBrowserCookie,
} from '#lib/auth/access-token-cookie';
import {
  readRefreshTokenFromBrowserCookie,
  REFRESH_TOKEN_COOKIE_NAME,
} from '#lib/auth/refresh-token-cookie';

function buildResponse(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
): AxiosResponse {
  return {
    config,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers: {},
    data,
  };
}

describe('apiClient refresh interceptor', () => {
  beforeEach(() => {
    document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=old-access-token; Path=/`;
    document.cookie = `${REFRESH_TOKEN_COOKIE_NAME}=old-refresh-token; Path=/`;
  });

  afterEach(() => {
    document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/`;
    document.cookie = `${REFRESH_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/`;
  });

  it('rotates tokens and retries a request after an access-token 401', async () => {
    let protectedRequestCount = 0;
    let refreshRequestCount = 0;
    apiClient.defaults.adapter = async (
      config: InternalAxiosRequestConfig,
    ): Promise<AxiosResponse> => {
      if (config.url === '/api/v1/auth/refresh') {
        refreshRequestCount += 1;
        return buildResponse(config, 200, {
          data: {
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
            tokenType: 'Bearer',
            expiresIn: '15m',
          },
        });
      }
      protectedRequestCount += 1;
      if (protectedRequestCount === 1) {
        const response = buildResponse(config, 401, {});
        throw new AxiosError(
          'Unauthorized',
          'ERR_BAD_REQUEST',
          config,
          undefined,
          response,
        );
      }
      expect(config.headers.Authorization).toBe('Bearer new-access-token');
      return buildResponse(config, 200, { data: { id: 'patient-id' } });
    };
    const response = await apiClient.get('/api/v1/patients/patient-id');
    expect(response.status).toBe(200);
    expect(protectedRequestCount).toBe(2);
    expect(refreshRequestCount).toBe(1);
    expect(readAccessTokenFromBrowserCookie()).toBe('new-access-token');
    expect(readRefreshTokenFromBrowserCookie()).toBe('new-refresh-token');
  });
});
