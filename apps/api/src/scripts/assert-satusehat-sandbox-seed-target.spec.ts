import { assertSatusehatSandboxSeedTarget } from './assert-satusehat-sandbox-seed-target';

describe('assertSatusehatSandboxSeedTarget', () => {
  const SANDBOX_URL = 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1';
  const PRODUCTION_URL = 'https://api-satusehat.dto.kemkes.go.id/fhir-r4/v1';

  it('allows a configured, non-production deployment pointed at the sandbox', () => {
    expect(() =>
      assertSatusehatSandboxSeedTarget({
        fhirBaseUrl: SANDBOX_URL,
        nodeEnv: 'development',
        isConfigured: true,
      }),
    ).not.toThrow();
  });

  it('refuses the production SATUSEHAT platform', () => {
    expect(() =>
      assertSatusehatSandboxSeedTarget({
        fhirBaseUrl: PRODUCTION_URL,
        nodeEnv: 'development',
        isConfigured: true,
      }),
    ).toThrow(/PRODUCTION, not the sandbox/);
  });

  /**
   * An unrecognised host may be a proxy in front of production, so it is not
   * given the benefit of the doubt.
   */
  it('refuses a host it cannot recognise', () => {
    expect(() =>
      assertSatusehatSandboxSeedTarget({
        fhirBaseUrl: 'https://satusehat.internal.example/fhir-r4/v1',
        nodeEnv: 'development',
        isConfigured: true,
      }),
    ).toThrow(/UNKNOWN, not the sandbox/);
  });

  /**
   * The database and the SATUSEHAT host are configured separately: a production
   * database pointed at the sandbox is still a production database.
   */
  it('refuses NODE_ENV=production even when the host is the sandbox', () => {
    expect(() =>
      assertSatusehatSandboxSeedTarget({
        fhirBaseUrl: SANDBOX_URL,
        nodeEnv: 'production',
        isConfigured: true,
      }),
    ).toThrow(/NODE_ENV is production/);
  });

  it('refuses unconfigured credentials, which would leave every record unlinked', () => {
    expect(() =>
      assertSatusehatSandboxSeedTarget({
        fhirBaseUrl: SANDBOX_URL,
        nodeEnv: undefined,
        isConfigured: false,
      }),
    ).toThrow(/credentials are not configured/);
  });
});
