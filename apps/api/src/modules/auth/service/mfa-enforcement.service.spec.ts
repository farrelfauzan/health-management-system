import { ConfigService } from '@nestjs/config';

import { MfaCryptoService } from '../../../common/crypto/mfa-crypto.service';
import { MfaEnforcementService } from './mfa-enforcement.service';

/** 32 bytes, hex — the shape `MFA_SECRET_ENCRYPTION_KEY` expects. */
const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

function buildService(overrides: Record<string, string> = {}): MfaEnforcementService {
  const configService = new ConfigService({
    MFA_SECRET_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    ...overrides,
  });
  return new MfaEnforcementService(configService, new MfaCryptoService(configService));
}

describe('MfaEnforcementService (SJ-8)', () => {
  it('leaves an account with only clinical permissions alone', () => {
    const actualRequirement = buildService().evaluate(['patient.read:any', 'encounter.write:any']);

    expect(actualRequirement.isPrivileged).toBe(false);
    expect(actualRequirement.matchedPermissions).toEqual([]);
  });

  it('names the permissions that made an account privileged', () => {
    const actualRequirement = buildService().evaluate([
      'patient.read:any',
      'role.assign:any',
      'audit.read:any',
    ]);

    expect(actualRequirement.isPrivileged).toBe(true);
    expect(actualRequirement.matchedPermissions).toEqual(['audit.read:any', 'role.assign:any']);
  });

  it('enforces immediately when no grace period is configured', () => {
    const actualRequirement = buildService().evaluate(['role.assign:any']);

    expect(actualRequirement.isWithinGrace).toBe(false);
    expect(actualRequirement.graceUntil).toBeNull();
  });

  it('holds off while the configured grace period is still running', () => {
    const service = buildService({
      MFA_ENFORCEMENT_GRACE_UNTIL: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const actualRequirement = service.evaluate(['role.assign:any']);

    expect(actualRequirement.isWithinGrace).toBe(true);
    expect(actualRequirement.graceUntil).toBeInstanceOf(Date);
  });

  it('starts enforcing once the grace period has passed', () => {
    const service = buildService({
      MFA_ENFORCEMENT_GRACE_UNTIL: new Date(Date.now() - 1_000).toISOString(),
    });

    const actualRequirement = service.evaluate(['role.assign:any']);

    expect(actualRequirement.isWithinGrace).toBe(false);
    expect(actualRequirement.graceUntil).toBeNull();
  });

  /**
   * A typo in an optional setting must not become an unbounded amnesty. The
   * value is logged and discarded, which fails towards enforcement — the
   * failure someone notices, and the one that cannot be exploited.
   */
  it('treats an unparseable grace period as no grace period', () => {
    const service = buildService({ MFA_ENFORCEMENT_GRACE_UNTIL: 'next tuesday' });

    const actualRequirement = service.evaluate(['role.assign:any']);

    expect(actualRequirement.isWithinGrace).toBe(false);
  });

  it('never reports a grace period for an account that needs no second factor', () => {
    const service = buildService({
      MFA_ENFORCEMENT_GRACE_UNTIL: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const actualRequirement = service.evaluate(['patient.read:any']);

    expect(actualRequirement.isWithinGrace).toBe(false);
    expect(actualRequirement.graceUntil).toBeNull();
  });

  /**
   * Without an encryption key nobody can enrol, so enforcing would lock every
   * administrator out with no route back in. Production cannot reach this
   * state — `validateEnvironment` refuses to boot — so failing open here only
   * affects a developer who has not set a key.
   */
  it('reports itself unenforceable when no encryption key is configured', () => {
    const configService = new ConfigService({});
    const service = new MfaEnforcementService(configService, new MfaCryptoService(configService));

    expect(service.isEnforceable).toBe(false);
    // The requirement is still computed truthfully; it is the caller that must
    // not act on it. Keeping the predicate honest means `GET /auth/mfa/status`
    // can still say "this account will need a second factor".
    expect(service.evaluate(['role.assign:any']).isPrivileged).toBe(true);
  });

  it('is enforceable once a key is present', () => {
    expect(buildService().isEnforceable).toBe(true);
  });
});
