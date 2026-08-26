import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The `notification.*` catalog rows and their role grants exist only in
 * `prisma/seed.sql`, and CI runs `migrate deploy` without ever seeding — so no
 * integration spec can observe them. This reads the seed file, which is the
 * artifact that ships (the same reasoning as the customer-service and
 * room-inpatient seed specs).
 */
describe('notification RBAC seed', () => {
  const PERMISSION_KEYS = ['notification.read:own', 'notification.manage:own'] as const;
  const HUMAN_ROLES = ['ADMIN', 'DOCTOR', 'PHARMACIST', 'PATIENT'] as const;
  const SERVICE_ROLES = ['BPJS_ANTREAN_SYSTEM', 'CUSTOMER_SERVICE_CHANNEL'] as const;
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  it('defines both catalog rows in OWN scope on the Notification resource', () => {
    expect(seedSql).toContain(
      "('notification.read:own', 'Notification', 'read', 'OWN'",
    );
    expect(seedSql).toContain(
      "('notification.manage:own', 'Notification', 'manage', 'OWN'",
    );
  });

  it('defines no ANY scope for notifications', () => {
    // A notification names its recipient; an ANY grant would be a read on
    // other people's inboxes with no surface that needs it.
    expect(seedSql).not.toContain('notification.read:any');
    expect(seedSql).not.toContain('notification.manage:any');
  });

  it.each(HUMAN_ROLES)('grants both keys to %s', (roleCode) => {
    for (const permissionKey of PERMISSION_KEYS) {
      expect(seedSql).toContain(`('${roleCode}', '${permissionKey}')`);
    }
  });

  it.each(SERVICE_ROLES)('withholds the feed from the %s service account', (roleCode) => {
    for (const permissionKey of PERMISSION_KEYS) {
      expect(seedSql).not.toContain(`('${roleCode}', '${permissionKey}')`);
    }
  });
});
