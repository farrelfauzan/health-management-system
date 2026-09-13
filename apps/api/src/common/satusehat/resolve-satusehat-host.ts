/**
 * The configured SATUSEHAT host on its own (P21-T06), so an operator can
 * recognise a proxy or a mock that
 * {@link resolveSatusehatEnvironment} can only call `UNKNOWN`.
 *
 * Returns the input unchanged when it is not a URL: the value is shown to an
 * administrator diagnosing configuration, and a malformed setting is exactly
 * what they need to see.
 */
export function resolveSatusehatHost(fhirBaseUrl: string): string {
  try {
    return new URL(fhirBaseUrl).host;
  } catch {
    return fhirBaseUrl;
  }
}
