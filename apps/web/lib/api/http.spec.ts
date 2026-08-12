import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '#lib/api/http';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  readAccessTokenFromBrowserCookie,
} from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';

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
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=old-session-hint; Path=/`;
  });

  afterEach(() => {
    document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/`;
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=; Max-Age=0; Path=/`;
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
    // SJ-6: the rotated refresh token never reaches this tier. The browser
    // holds it as an httpOnly cookie, so there is nothing here to assert on
    // beyond the access token the interceptor did persist.
    expect(readAccessTokenFromBrowserCookie()).toBe('new-access-token');
  });
});
