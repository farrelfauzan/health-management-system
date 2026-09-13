import { resolveSatusehatEnvironment } from '../common/satusehat/resolve-satusehat-environment';

/**
 * Refuses to seed test identities anywhere but a sandbox-pointed,
 * non-production deployment (P21-T10).
 *
 * Keyed on {@link resolveSatusehatEnvironment} — the same derivation the
 * integrations screen shows (P21-T06) — rather than a separate opt-out flag,
 * so a deployment cannot seed test NIKs by forgetting to set one. An
 * unrecognised host is refused too: `UNKNOWN` may be a proxy in front of
 * production, and test identifiers written there would attach clinic data to
 * the national record of a synthetic person.
 *
 * `NODE_ENV=production` is refused on its own as a second, independent check,
 * because the database and the SATUSEHAT host are configured separately and a
 * production database pointed at the sandbox is still a production database.
 *
 * Unconfigured credentials are refused last: every seeded record is linked by a
 * live lookup, so without them the command would create unlinked rows and
 * report success.
 */
export function assertSatusehatSandboxSeedTarget(input: {
  fhirBaseUrl: string;
  nodeEnv: string | undefined;
  isConfigured: boolean;
}): void {
  if (input.nodeEnv === 'production') {
    throw new Error('Refusing to seed SATUSEHAT test identities: NODE_ENV is production');
  }
  const environment = resolveSatusehatEnvironment(input.fhirBaseUrl);
  if (environment !== 'SANDBOX') {
    throw new Error(
      `Refusing to seed SATUSEHAT test identities: SATUSEHAT_FHIR_BASE_URL resolves to ${environment}, not the sandbox`,
    );
  }
  if (!input.isConfigured) {
    throw new Error(
      'Refusing to seed SATUSEHAT test identities: credentials are not configured, and every record is linked by a live lookup',
    );
  }
}
