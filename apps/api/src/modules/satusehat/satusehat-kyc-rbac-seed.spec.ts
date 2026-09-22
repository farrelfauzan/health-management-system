import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Who may start a SATUSEHAT KYC verification at the desk (P24-T16, FR-KYC-04).
 *
 * The ticket names ADMIN and MIDWIFE. DOCTOR is granted too, because
 * `midwife-rbac-seed.spec.ts` pins MIDWIFE to DOCTOR's grants minus
 * `lab-result.verify:any` (D-034) — a MIDWIFE-only grant would break that
 * invariant, and a clinician who is also the desk is exactly the klinik bidan
 * case. Reads the seed file directly: CI runs `migrate deploy` without
 * seeding, so no integration spec can observe these rows.
 */
describe('SATUSEHAT KYC RBAC seed (P24-T16)', () => {
  const PERMISSION_KEY = 'satusehat.kyc.verify:any';
  const GRANTED_ROLES = ['ADMIN', 'DOCTOR', 'MIDWIFE'] as const;
  const REFUSED_ROLES = [
    'PHARMACIST',
    'LAB_TECHNICIAN',
    'PATIENT',
    'BPJS_ANTREAN_SYSTEM',
    'CUSTOMER_SERVICE_CHANNEL',
  ] as const;

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function hasBinding(roleCode: string): boolean {
    return seedSql.includes(`('${roleCode}', '${PERMISSION_KEY}')`);
  }

  it('defines the key on its own subject with the verify action and ANY scope', () => {
    const permissionRow = seedSql
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(`('${PERMISSION_KEY}'`));

    expect(permissionRow).toContain("'SatusehatKyc', 'verify', 'ANY'");
  });

  it.each(GRANTED_ROLES)('grants it to %s', (roleCode) => {
    expect(hasBinding(roleCode)).toBe(true);
  });

  it.each(REFUSED_ROLES)('writes no row for %s', (roleCode) => {
    expect(hasBinding(roleCode)).toBe(false);
  });

  it('defines no own-scope variant: the operator, not the record, is what the key is about', () => {
    expect(seedSql).not.toContain("('satusehat.kyc.verify:own'");
  });
});
