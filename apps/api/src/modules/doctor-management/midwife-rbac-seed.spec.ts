import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The `MIDWIFE` role (D-034, P24-T02): a clinician with DOCTOR's clinician
 * grants, except signing out a lab result, which is not among a midwife's own
 * authorities in Permenkes 28/2017 Pasal 19–21.
 *
 * Built from the DOCTOR rows rather than a pinned list, so a clinician grant
 * added to DOCTOR later without a decision about midwives fails here instead of
 * silently leaving her out.
 *
 * Reads the seed file directly: CI runs `migrate deploy` without seeding, so no
 * integration spec can observe these rows.
 */
describe('MIDWIFE role seed', () => {
  const WITHHELD_FROM_MIDWIFE = ['lab-result.verify:any'] as const;

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function collectGrants(roleCode: string): Set<string> {
    const pattern = new RegExp(`\\('${roleCode}', '([^']+)'\\)`, 'g');
    return new Set([...seedSql.matchAll(pattern)].map((match) => match[1] ?? ''));
  }

  it('defines the MIDWIFE role', () => {
    expect(seedSql).toMatch(/\('MIDWIFE', 'Midwife', '[^']+'\)/);
  });

  it("holds every one of DOCTOR's grants except the ones withheld on purpose", () => {
    const expectedGrants = [...collectGrants('DOCTOR')]
      .filter((key) => !(WITHHELD_FROM_MIDWIFE as readonly string[]).includes(key))
      .sort();

    expect([...collectGrants('MIDWIFE')].sort()).toEqual(expectedGrants);
  });

  it('cannot sign out a lab result', () => {
    expect(collectGrants('MIDWIFE').has('lab-result.verify:any')).toBe(false);
  });

  it('opens the clinician portal, like a doctor', () => {
    expect(collectGrants('MIDWIFE').has('portal.doctor-access:any')).toBe(true);
  });

  /** D-034: a new role, no new permission keys. */
  it('introduces no midwife-specific permission key', () => {
    expect(seedSql).not.toMatch(/\('midwife[.-]/i);
  });
});
