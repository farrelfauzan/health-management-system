import { ConfigService } from '@nestjs/config';

import { resolvePdfRendererConfig } from './pdf.config';

function buildConfigService(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('resolvePdfRendererConfig', () => {
  it('treats an absent renderer as unconfigured rather than as an error', () => {
    // Boot must succeed without the sidecar: a clinic that has not deployed it
    // still takes payments, it just cannot produce a PDF.
    const actualConfig = resolvePdfRendererConfig(buildConfigService({}));

    expect(actualConfig.baseUrl).toBe('');
    expect(actualConfig.requestTimeoutMs).toBe(30_000);
    expect(actualConfig.maxOutputBytes).toBe(20 * 1024 * 1024);
  });

  it('normalises the base URL by stripping trailing slashes', () => {
    const actualConfig = resolvePdfRendererConfig(
      buildConfigService({ PDF_RENDERER_BASE_URL: 'http://gotenberg:3000//' }),
    );

    expect(actualConfig.baseUrl).toBe('http://gotenberg:3000');
  });

  it('rejects a base URL that is not a URL', () => {
    expect(() =>
      resolvePdfRendererConfig(buildConfigService({ PDF_RENDERER_BASE_URL: 'gotenberg' })),
    ).toThrow('must be a valid URL');
  });

  it('rejects anything that parses but is not HTTP', () => {
    // Both of these parse cleanly. `gotenberg:3000` is the scheme-less typo
    // (host taken as the scheme, port as the path); `file:` is the one that
    // would otherwise send every render into a path fetch cannot serve.
    expect(() =>
      resolvePdfRendererConfig(buildConfigService({ PDF_RENDERER_BASE_URL: 'gotenberg:3000' })),
    ).toThrow('must use http or https');
    expect(() =>
      resolvePdfRendererConfig(
        buildConfigService({ PDF_RENDERER_BASE_URL: 'file:///var/run/gotenberg.sock' }),
      ),
    ).toThrow('must use http or https');
  });

  it('rejects a non-positive or non-integer timeout', () => {
    expect(() =>
      resolvePdfRendererConfig(buildConfigService({ PDF_RENDERER_TIMEOUT_MS: '0' })),
    ).toThrow('PDF_RENDERER_TIMEOUT_MS must be a positive integer');
    expect(() =>
      resolvePdfRendererConfig(buildConfigService({ PDF_RENDERER_MAX_OUTPUT_BYTES: '1.5' })),
    ).toThrow('PDF_RENDERER_MAX_OUTPUT_BYTES must be a positive integer');
  });
});
