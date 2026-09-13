import { SatusehatEnvironmentValue } from '@hms/shared-types';

/**
 * Kemenkes publishes one host per platform. Production is the bare
 * `api-satusehat`; every non-production platform carries a suffix on that
 * label — `-stg` today, and the docs have used `-dev` before.
 */
const PRODUCTION_HOST = 'api-satusehat.dto.kemkes.go.id';
const NON_PRODUCTION_HOST_PATTERN = /^api-satusehat-[a-z0-9]+\.dto\.kemkes\.go\.id$/;

/**
 * Which SATUSEHAT platform a base URL points at (P21-T06).
 *
 * Derived from the URL rather than a separate environment flag, deliberately: a
 * flag is a second source of truth that can disagree with where the bundles
 * actually go, and someone forgetting to flip it during the production switch is
 * the exact failure this is meant to make visible.
 *
 * An unrecognised host answers `UNKNOWN` rather than defaulting to `SANDBOX`.
 * Calling an unknown proxy "sandbox" would be a guess presented as fact, and the
 * whole point of showing this is that nobody should mistake a sandbox success
 * for a real one — or the reverse.
 */
export function resolveSatusehatEnvironment(fhirBaseUrl: string): SatusehatEnvironmentValue {
  let host: string;
  try {
    host = new URL(fhirBaseUrl).host.toLowerCase();
  } catch {
    return 'UNKNOWN';
  }
  if (host === PRODUCTION_HOST) {
    return 'PRODUCTION';
  }
  return NON_PRODUCTION_HOST_PATTERN.test(host) ? 'SANDBOX' : 'UNKNOWN';
}
