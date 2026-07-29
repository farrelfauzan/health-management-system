import { ConfigService } from '@nestjs/config';

import { resolveBpjsPcareAdapterConfig } from './bpjs-pcare.config';

function buildConfigService(env: Record<string, string>): ConfigService {
  return new ConfigService(env);
}

describe('resolveBpjsPcareAdapterConfig', () => {
  it('applies defaults when nothing is set', () => {
    const actualConfig = resolveBpjsPcareAdapterConfig(buildConfigService({}));

    expect(actualConfig).toEqual({
      developmentBaseUrl: 'https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev',
      productionBaseUrl: 'https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0',
      requestTimeoutMs: 30_000,
      maxRetryAttempts: 2,
      retryBaseDelayMs: 250,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerOpenDurationMs: 30_000,
      workerEnabled: true,
      workerPollIntervalMs: 15_000,
      submissionMaxAttempts: 8,
      submissionRetryBaseDelayMs: 60_000,
    });
  });

  it('turns the worker flag off only on an explicit false', () => {
    const actualConfig = resolveBpjsPcareAdapterConfig(
      buildConfigService({ BPJS_WORKER_ENABLED: 'false' }),
    );

    expect(actualConfig.workerEnabled).toBe(false);
  });

  it('accepts overrides and strips trailing slashes from base URLs', () => {
    const actualConfig = resolveBpjsPcareAdapterConfig(
      buildConfigService({
        BPJS_PCARE_DEVELOPMENT_BASE_URL: 'https://dvlp.bpjs-kesehatan.go.id:9081/pcare-rest-v3.0/',
        BPJS_PCARE_MAX_RETRY_ATTEMPTS: '0',
        BPJS_PCARE_REQUEST_TIMEOUT_MS: '5000',
      }),
    );

    expect(actualConfig.developmentBaseUrl).toBe(
      'https://dvlp.bpjs-kesehatan.go.id:9081/pcare-rest-v3.0',
    );
    expect(actualConfig.maxRetryAttempts).toBe(0);
    expect(actualConfig.requestTimeoutMs).toBe(5_000);
  });

  it('rejects an invalid base URL', () => {
    expect(() =>
      resolveBpjsPcareAdapterConfig(
        buildConfigService({ BPJS_PCARE_PRODUCTION_BASE_URL: 'not-a-url' }),
      ),
    ).toThrow('BPJS_PCARE_PRODUCTION_BASE_URL must be a valid URL');
  });

  it('rejects a non-integer retry count', () => {
    expect(() =>
      resolveBpjsPcareAdapterConfig(buildConfigService({ BPJS_PCARE_MAX_RETRY_ATTEMPTS: '1.5' })),
    ).toThrow('BPJS_PCARE_MAX_RETRY_ATTEMPTS must be a non-negative integer');
  });

  it('rejects a zero timeout', () => {
    expect(() =>
      resolveBpjsPcareAdapterConfig(buildConfigService({ BPJS_PCARE_REQUEST_TIMEOUT_MS: '0' })),
    ).toThrow('BPJS_PCARE_REQUEST_TIMEOUT_MS must be a positive integer');
  });
});
