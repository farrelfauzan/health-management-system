import { resolveSatusehatEnvironment } from './resolve-satusehat-environment';

describe('resolveSatusehatEnvironment', () => {
  it('recognises the production platform', () => {
    expect(
      resolveSatusehatEnvironment('https://api-satusehat.dto.kemkes.go.id/fhir-r4/v1'),
    ).toBe('PRODUCTION');
  });

  it('recognises the staging sandbox, which is what the repo defaults to', () => {
    expect(
      resolveSatusehatEnvironment('https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1'),
    ).toBe('SANDBOX');
  });

  it('treats any other suffixed Kemenkes host as a non-production platform', () => {
    expect(
      resolveSatusehatEnvironment('https://api-satusehat-dev.dto.kemkes.go.id/fhir-r4/v1'),
    ).toBe('SANDBOX');
  });

  it('ignores case and a trailing path, which configuration routinely carries', () => {
    expect(
      resolveSatusehatEnvironment('https://API-SATUSEHAT.DTO.KEMKES.GO.ID/fhir-r4/v1/'),
    ).toBe('PRODUCTION');
  });

  /**
   * The distinction this whole value exists for. An unrecognised host must not
   * be called a sandbox: an operator told "sandbox" about a proxy that happens
   * to forward to production would be reading a guess as a fact.
   */
  it('answers UNKNOWN for a host it does not recognise rather than assuming sandbox', () => {
    expect(resolveSatusehatEnvironment('https://satusehat.internal.example/fhir-r4/v1')).toBe(
      'UNKNOWN',
    );
    expect(resolveSatusehatEnvironment('http://localhost:4010/fhir-r4/v1')).toBe('UNKNOWN');
  });

  it('does not mistake a lookalike host for production', () => {
    expect(
      resolveSatusehatEnvironment('https://api-satusehat.dto.kemkes.go.id.evil.example/fhir-r4/v1'),
    ).toBe('UNKNOWN');
    expect(resolveSatusehatEnvironment('https://not-api-satusehat.dto.kemkes.go.id/fhir')).toBe(
      'UNKNOWN',
    );
  });

  it('answers UNKNOWN for a value that is not a URL at all', () => {
    expect(resolveSatusehatEnvironment('')).toBe('UNKNOWN');
    expect(resolveSatusehatEnvironment('api-satusehat.dto.kemkes.go.id')).toBe('UNKNOWN');
  });
});
