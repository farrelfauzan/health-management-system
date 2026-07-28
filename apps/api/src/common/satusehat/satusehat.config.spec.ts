import { ConfigService } from '@nestjs/config';

import { resolveSatusehatConfig } from './satusehat.config';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => overrides[key]),
  } as unknown as ConfigService;
}

const FULL_CREDENTIALS: Record<string, string> = {
  SATUSEHAT_ORGANIZATION_ID: 'org-uuid',
  SATUSEHAT_CLIENT_ID: 'client-id',
  SATUSEHAT_CLIENT_SECRET: 'client-secret',
};

describe('resolveSatusehatConfig', () => {
  it('resolves unconfigured sandbox defaults when no environment values are set', () => {
    const actualConfig = resolveSatusehatConfig(buildConfigService());

    expect(actualConfig).toEqual({
      isConfigured: false,
      fhirBaseUrl: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1',
      authBaseUrl: 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1',
      organizationId: undefined,
      clientId: undefined,
      clientSecret: undefined,
      locationId: undefined,
      locationName: undefined,
      requestTimeoutMs: 30_000,
      maxRetryAttempts: 2,
      retryBaseDelayMs: 250,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerOpenDurationMs: 30_000,
    });
  });

  it('marks the adapter configured when all three credential values are present', () => {
    const actualConfig = resolveSatusehatConfig(buildConfigService(FULL_CREDENTIALS));

    expect(actualConfig.isConfigured).toBe(true);
    expect(actualConfig.organizationId).toBe('org-uuid');
    expect(actualConfig.clientId).toBe('client-id');
    expect(actualConfig.clientSecret).toBe('client-secret');
  });

  it('resolves the optional location pair independently of the credential trio', () => {
    const actualConfig = resolveSatusehatConfig(
      buildConfigService({
        SATUSEHAT_LOCATION_ID: 'location-uuid',
        SATUSEHAT_LOCATION_NAME: 'Ruang Periksa Umum',
      }),
    );

    expect(actualConfig.locationId).toBe('location-uuid');
    expect(actualConfig.locationName).toBe('Ruang Periksa Umum');
    expect(actualConfig.isConfigured).toBe(false);
  });

  it('throws when only part of the credential set is provided', () => {
    expect(() =>
      resolveSatusehatConfig(buildConfigService({ SATUSEHAT_CLIENT_ID: 'client-id' })),
    ).toThrow('must be set together or omitted together');
  });

  it('strips trailing slashes from base URLs', () => {
    const actualConfig = resolveSatusehatConfig(
      buildConfigService({
        SATUSEHAT_FHIR_BASE_URL: 'https://api-satusehat.dto.kemkes.go.id/fhir-r4/v1/',
        SATUSEHAT_AUTH_BASE_URL: 'https://api-satusehat.dto.kemkes.go.id/oauth2/v1/',
      }),
    );

    expect(actualConfig.fhirBaseUrl).toBe('https://api-satusehat.dto.kemkes.go.id/fhir-r4/v1');
    expect(actualConfig.authBaseUrl).toBe('https://api-satusehat.dto.kemkes.go.id/oauth2/v1');
  });

  it('throws on an invalid base URL', () => {
    expect(() =>
      resolveSatusehatConfig(buildConfigService({ SATUSEHAT_FHIR_BASE_URL: 'not-a-url' })),
    ).toThrow('SATUSEHAT_FHIR_BASE_URL must be a valid URL');
  });

  it('throws on a non-integer timeout', () => {
    expect(() =>
      resolveSatusehatConfig(buildConfigService({ SATUSEHAT_REQUEST_TIMEOUT_MS: 'soon' })),
    ).toThrow('SATUSEHAT_REQUEST_TIMEOUT_MS must be a non-negative integer');
  });

  it('throws on a zero timeout but accepts zero retry attempts', () => {
    expect(() =>
      resolveSatusehatConfig(buildConfigService({ SATUSEHAT_REQUEST_TIMEOUT_MS: '0' })),
    ).toThrow('SATUSEHAT_REQUEST_TIMEOUT_MS must be a positive integer');
    const actualConfig = resolveSatusehatConfig(
      buildConfigService({ SATUSEHAT_MAX_RETRY_ATTEMPTS: '0' }),
    );
    expect(actualConfig.maxRetryAttempts).toBe(0);
  });
});
