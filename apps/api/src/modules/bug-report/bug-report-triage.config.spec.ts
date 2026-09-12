import { ConfigService } from '@nestjs/config';

import { resolveBugReportTriageConfig } from './bug-report-triage.config';

function buildConfigService(values: Record<string, string>): ConfigService {
  return new ConfigService(values);
}

describe('resolveBugReportTriageConfig', () => {
  it('reports a deployment with no triage variables as unconfigured, and boots', () => {
    const actualConfig = resolveBugReportTriageConfig(buildConfigService({}));

    expect(actualConfig.isConfigured).toBe(false);
    expect(actualConfig.providerKind).toBeNull();
    expect(actualConfig.apiKey).toBeNull();
  });

  it('resolves a complete provider configuration', () => {
    const actualConfig = resolveBugReportTriageConfig(
      buildConfigService({
        BUG_TRIAGE_AI_PROVIDER_KIND: 'ANTHROPIC',
        BUG_TRIAGE_AI_MODEL: 'claude-sonnet-5',
        BUG_TRIAGE_AI_API_KEY: 'sk-test',
      }),
    );

    expect(actualConfig.isConfigured).toBe(true);
    expect(actualConfig.providerKind).toBe('ANTHROPIC');
    expect(actualConfig.model).toBe('claude-sonnet-5');
  });

  /**
   * GitHub Actions expands an unconfigured secret to `""` rather than leaving the
   * variable unset, so an empty value has to read as absent — otherwise CI boots
   * with a present, empty key that the vendor rejects at the first report.
   */
  it('treats an empty value exactly like an absent one', () => {
    const actualConfig = resolveBugReportTriageConfig(
      buildConfigService({
        BUG_TRIAGE_AI_PROVIDER_KIND: '',
        BUG_TRIAGE_AI_MODEL: '',
        BUG_TRIAGE_AI_API_KEY: '',
      }),
    );

    expect(actualConfig.isConfigured).toBe(false);
  });

  /**
   * Half a credential is never a working deployment: it boots, looks configured,
   * and fails hours later in a worker nobody is watching.
   */
  it('refuses to boot on a provider kind with no model', () => {
    expect(() =>
      resolveBugReportTriageConfig(
        buildConfigService({
          BUG_TRIAGE_AI_PROVIDER_KIND: 'ANTHROPIC',
          BUG_TRIAGE_AI_API_KEY: 'sk-test',
        }),
      ),
    ).toThrow('BUG_TRIAGE_AI_MODEL is required');
  });

  it('refuses to boot on a model with no provider kind', () => {
    expect(() =>
      resolveBugReportTriageConfig(buildConfigService({ BUG_TRIAGE_AI_MODEL: 'claude-sonnet-5' })),
    ).toThrow('BUG_TRIAGE_AI_PROVIDER_KIND is required');
  });

  it('refuses to boot on a provider kind nothing can route', () => {
    expect(() =>
      resolveBugReportTriageConfig(
        buildConfigService({
          BUG_TRIAGE_AI_PROVIDER_KIND: 'MISTRAL',
          BUG_TRIAGE_AI_MODEL: 'mistral-large',
          BUG_TRIAGE_AI_API_KEY: 'sk-test',
        }),
      ),
    ).toThrow('BUG_TRIAGE_AI_PROVIDER_KIND must be one of');
  });

  it('requires an API key for every kind but the self-hosted one', () => {
    expect(() =>
      resolveBugReportTriageConfig(
        buildConfigService({
          BUG_TRIAGE_AI_PROVIDER_KIND: 'ANTHROPIC',
          BUG_TRIAGE_AI_MODEL: 'claude-sonnet-5',
        }),
      ),
    ).toThrow('BUG_TRIAGE_AI_API_KEY is required');
  });

  it('accepts a keyless self-hosted upstream', () => {
    const actualConfig = resolveBugReportTriageConfig(
      buildConfigService({
        BUG_TRIAGE_AI_PROVIDER_KIND: 'OLLAMA',
        BUG_TRIAGE_AI_MODEL: 'llama3.2:latest',
      }),
    );

    expect(actualConfig.isConfigured).toBe(true);
    expect(actualConfig.apiKey).toBeNull();
  });

  it('rejects a non-numeric interval rather than silently using the default', () => {
    expect(() =>
      resolveBugReportTriageConfig(
        buildConfigService({ BUG_TRIAGE_WORKER_POLL_INTERVAL_MS: 'soon' }),
      ),
    ).toThrow('BUG_TRIAGE_WORKER_POLL_INTERVAL_MS must be a positive integer');
  });

  it('defaults the worker to on, because a report nobody triages is a report nobody reads', () => {
    expect(resolveBugReportTriageConfig(buildConfigService({})).workerEnabled).toBe(true);
  });

  it('switches the worker off when asked', () => {
    const actualConfig = resolveBugReportTriageConfig(
      buildConfigService({ BUG_TRIAGE_WORKER_ENABLED: 'false' }),
    );

    expect(actualConfig.workerEnabled).toBe(false);
  });
});
