import { ConfigService } from '@nestjs/config';

import { BpjsAntreanInboundConfig } from './bpjs-antrean-inbound.config';

function buildConfig(values: Record<string, string>): BpjsAntreanInboundConfig {
  const configService = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new BpjsAntreanInboundConfig(configService);
}

describe('BpjsAntreanInboundConfig', () => {
  it('leaves the surface disabled when no allowlist is configured', () => {
    // The single most important assertion in this module: merging P14-T04
    // must not give any existing deployment a public write path.
    const actualConfig = buildConfig({});

    expect(actualConfig.isEnabled).toBe(false);
    expect(actualConfig.allowedSourceRanges).toHaveLength(0);
  });

  it('leaves the surface disabled for an empty or whitespace allowlist', () => {
    expect(buildConfig({ BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '' }).isEnabled).toBe(false);
    expect(buildConfig({ BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '   ' }).isEnabled).toBe(false);
  });

  it('enables the surface once ranges are configured', () => {
    const actualConfig = buildConfig({
      BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '203.0.113.0/24, 198.51.100.7',
    });

    expect(actualConfig.isEnabled).toBe(true);
    expect(actualConfig.allowedSourceRanges).toHaveLength(2);
  });

  it('fails at startup on an unparseable range rather than dropping it', () => {
    // Silently skipping an entry would leave the operator believing a range is
    // allowed when it is not, or — worse on a rotation — believing one was
    // removed when it was only mistyped.
    expect(() =>
      buildConfig({ BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '203.0.113.0/24, nonsense' }),
    ).toThrow(/not an IP address or CIDR range/);
  });

  it('rejects a token lifetime beyond a day', () => {
    expect(() =>
      buildConfig({
        BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '203.0.113.0/24',
        BPJS_ANTREAN_INBOUND_TOKEN_TTL_SECONDS: '172800',
      }),
    ).toThrow(/must not exceed/);
  });

  it('rejects non-numeric limits', () => {
    expect(() =>
      buildConfig({
        BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '203.0.113.0/24',
        BPJS_ANTREAN_INBOUND_WRITE_RPM: 'lots',
      }),
    ).toThrow(/must be a non-negative integer/);
  });

  it('reports readiness as false while the inbound credentials are missing', () => {
    // Both halves have to be present: BPJS's ranges *and* the credential pair
    // it presents. Either one alone is an incomplete UAT setup.
    const actualConfig = buildConfig({ BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '203.0.113.0/24' });

    expect(actualConfig.buildReadiness(false).isEnabled).toBe(false);
    expect(actualConfig.buildReadiness(true).isEnabled).toBe(true);
  });

  it('defaults to trusting no proxy hop', () => {
    const actualConfig = buildConfig({ BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '203.0.113.0/24' });

    expect(actualConfig.trustedProxyHopCount).toBe(0);
  });
});
