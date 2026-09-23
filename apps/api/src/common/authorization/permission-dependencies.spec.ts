import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EXPLICIT_PERMISSION_DEPENDENCIES,
  expandPermissionDependencies,
  resolvePermissionRequirements,
} from '@hms/shared-types';

/**
 * P22-T04. The IAM screen ticks, and the API saves, whatever a key needs. That
 * is only safe if the rule describes how roles already work — otherwise saving
 * a seeded role's own set through the screen would hand it something nobody
 * decided. So every seeded role must already satisfy every requirement. Read
 * off `seed.sql` because CI never seeds.
 */
describe('permission dependency rules against the seed', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');
  const catalogKeys = new Set(
    [...seedSql.matchAll(/^\s*\('([a-z0-9.:-]+)', '[A-Za-z]+', '[a-z-]+', '(?:ANY|OWN)'/gm)].map(
      (match) => match[1] ?? '',
    ),
  );

  function collectGrantsByRole(): Map<string, Set<string>> {
    const grants = new Map<string, Set<string>>();
    for (const match of seedSql.matchAll(/\('([A-Z_]+)', '([a-z0-9.-]+:(?:any|own))'\)/g)) {
      const roleCode = match[1] ?? '';
      const keys = grants.get(roleCode) ?? new Set<string>();
      keys.add(match[2] ?? '');
      grants.set(roleCode, keys);
    }
    return grants;
  }

  it('reads a real catalogue from the seed', () => {
    expect(catalogKeys.size).toBeGreaterThan(100);
    expect(catalogKeys.has('patient.read:any')).toBe(true);
  });

  it('is already satisfied by every seeded role, so saving one through IAM adds nothing', () => {
    const missing: string[] = [];
    for (const [roleCode, keys] of collectGrantsByRole()) {
      const expanded = expandPermissionDependencies(keys, catalogKeys);
      [...expanded]
        .filter((key) => !keys.has(key))
        .forEach((key) => missing.push(`${roleCode} → ${key}`));
    }

    expect(missing).toEqual([]);
  });

  it('names only real catalogue keys as explicit dependencies', () => {
    const named = Object.entries(EXPLICIT_PERMISSION_DEPENDENCIES).flatMap(([key, requirements]) => [
      key,
      ...requirements,
    ]);

    expect(named.filter((key) => !catalogKeys.has(key))).toEqual([]);
  });

  it('pairs a write with the read of the same resource and scope', () => {
    expect(resolvePermissionRequirements('patient.update:any', catalogKeys)).toEqual([]);
    expect(resolvePermissionRequirements('invoice.write:any', catalogKeys)).toContain(
      'invoice.read:any',
    );
    expect(resolvePermissionRequirements('encounter.write:own', catalogKeys)).toEqual([
      'encounter.read:own',
    ]);
  });

  it('does not widen other verbs into a read nobody decided (D-033)', () => {
    expect(resolvePermissionRequirements('patient.create-newborn:any', catalogKeys)).toEqual([]);
    expect(resolvePermissionRequirements('admission.admit:any', catalogKeys)).toEqual([]);
  });

  it('lets billing see the visit it bills, and nothing of its record (P22-T05)', () => {
    expect(resolvePermissionRequirements('invoice.write:any', catalogKeys)).toEqual([
      'encounter.read-summary:any',
      'invoice.read:any',
    ]);
  });

  it('puts triage on the admin shell, where its only screen is', () => {
    expect(resolvePermissionRequirements('encounter.record-vitals:any', catalogKeys)).toEqual([
      'portal.admin-access:any',
    ]);
  });
});
