import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CUSTOMER_SERVICE_SYSTEM_ACTOR_EMAIL } from './service/cs-system-actor.service';

/**
 * The channel's reserved actor and its grants exist only as rows in
 * `prisma/seed.sql`, and CI runs `migrate deploy` without ever seeding — so no
 * integration spec can observe them. This reads the seed file, which is the
 * artifact that ships.
 *
 * The assertions run in both directions, for the same reason the BPJS bridge's
 * do. A missing grant is an outage: every chat booking fails on the next fresh
 * database. An *extra* grant is a security regression, and a worse one here
 * than there — this is the reach an anonymous member of the public gets if the
 * webhook's secret-token check is ever defeated. That is why the grant test
 * asserts an exact set rather than a subset.
 */
describe('customer-service channel RBAC seed', () => {
  const SYSTEM_ROLE_CODE = 'CUSTOMER_SERVICE_CHANNEL';

  const EXPECTED_GRANTS = [
    'appointment.create:any',
    'appointment.read:any',
    'appointment.session.read:any',
    'patient.create:any',
    'patient.read:any',
  ] as const;

  /**
   * Grants that must never appear on this role. Each is a specific thing a
   * public chat must not be able to do, so a future permission sweep that adds
   * one fails here rather than in production.
   */
  const FORBIDDEN_GRANTS = [
    // The channel never edits a record it did not create — §5.2 has the front
    // desk complete a draft, and a chat that could write to an existing
    // patient would make §5.1.1's verification pointless.
    'patient.update:any',
    // No tool returns an identifier, and the phone match is a normalised digit
    // comparison rather than a decryption.
    'patient.read-identifier:any',
    'patient.import-identifier:any',
    // Cancelling by chat is out of scope until a confirmation-code lookup
    // exists (§1.3).
    'appointment.cancel:any',
    'appointment.approve:any',
    // A chat booking is an appointment. Check-in stays a human act at the
    // counter, and the queue number is assigned there.
    'registration.create:any',
    'registration.update:any',
    // Nothing clinical, ever.
    'encounter.write:any',
    'prescription.write:any',
    'document.write:any',
    // It must not be able to grant itself anything.
    'role.assign:any',
    'user.create:any',
  ] as const;

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function hasBinding(permissionKey: string): boolean {
    return seedSql.includes(`('${SYSTEM_ROLE_CODE}', '${permissionKey}')`);
  }

  it('defines the reserved role', () => {
    expect(seedSql).toContain(`('${SYSTEM_ROLE_CODE}', 'Customer Service Channel'`);
  });

  it('provisions the reserved account as a system account', () => {
    expect(seedSql).toContain(CUSTOMER_SERVICE_SYSTEM_ACTOR_EMAIL);
    // `is_system` is what the login path refuses on, and what
    // `createChannelDraftPatient` requires before it will record a deferred
    // privacy notice. Without it the account is an ordinary user whose
    // password an admin could set.
    expect(seedSql).toMatch(/'!no-login:customer-service-channel'/);
    expect(seedSql).toContain(
      `md5('user:${CUSTOMER_SERVICE_SYSTEM_ACTOR_EMAIL}')::uuid`,
    );
  });

  it('grants exactly the five the booking flow needs and nothing more', () => {
    const grantPattern = new RegExp(`^\\('${SYSTEM_ROLE_CODE}', '([a-z0-9.\\-]+:[a-z]+)'\\),?$`);
    const actualGranted = seedSql
      .split('\n')
      .map((line) => grantPattern.exec(line.trim())?.[1])
      .filter((permissionKey): permissionKey is string => permissionKey !== undefined);

    expect(actualGranted.sort()).toEqual([...EXPECTED_GRANTS].sort());
  });

  it.each(FORBIDDEN_GRANTS)('withholds %s from the channel', (permissionKey) => {
    expect(hasBinding(permissionKey)).toBe(false);
  });
});
