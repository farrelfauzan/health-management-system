import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CLINICAL_CONTENT_PERMISSION_KEYS, CLINICIAN_ROLE_CODES } from '@hms/shared-types';

/**
 * D-033 with teeth (P22-T02).
 *
 * The decision says the content of a patient's clinical record is reached only
 * by the clinicians who examine that patient, through two narrow openings:
 * **task access**, where a health worker reads the one order they are carrying
 * out, and **billing lines**, where the cashier sees what they charge for.
 * Without this spec that rule is prose, and a seed line added in a hurry
 * quietly undoes it.
 *
 * It reads `seed.sql` directly, the same way `midwife-rbac-seed.spec.ts` and
 * `doctor-own-profile-rbac-seed.spec.ts` do: CI runs `migrate deploy` without
 * seeding, so no integration spec can observe these rows.
 *
 * The allowed set is {@link CLINICIAN_ROLE_CODES}, never the literal
 * `'DOCTOR'` — a midwife is a clinician (D-034), and a guard that forgot it
 * would flag the whole MIDWIFE block.
 */
describe('D-033 clinical access seed guard', () => {
  /**
   * The permission keys that reach clinical record **content**, as D-033
   * defines it: notes and impressions, diagnoses, procedures, vitals,
   * allergies, immunizations, prescriptions and dispensing, lab orders,
   * specimens and results, clinical documents, and the content of chat about
   * a patient's health.
   *
   * Deliberately **not** here, because D-033 says they are not clinical
   * content: identity and identifiers, demographics, appointments and
   * sessions, queue position, registration and payment status — and
   * `chat.session.read:any`, which is who, when and which channel, not what
   * was said.
   */
  const CLINICAL_CONTENT_KEYS: readonly string[] = CLINICAL_CONTENT_PERMISSION_KEYS;

  /**
   * The two openings D-033 defines, and nothing else.
   *
   * Each entry is a role holding one key it cannot do its job without, and
   * each says which opening it is. A key that is not on this list and not held
   * by a clinician fails the spec — which is the point.
   */
  const TASK_ACCESS_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
    // Dispensing: the apoteker reads the prescription they are filling.
    PHARMACIST: ['prescription.read:any', 'dispense.write:any'],
    // Bench work: the ATLM reads the order they are running and writes its result.
    LAB_TECHNICIAN: [
      'lab-order.read:any',
      'lab-specimen.write:any',
      'lab-result.write:any',
      'lab-result.verify:any',
    ],
    /**
     * **Temporary, and exactly what this ticket did not settle.** These are
     * D-033 rows the product owner scoped out on 2026-09-20 because each takes
     * a working screen away from a pilot clinic on the next deploy, and each
     * needs a decision this ticket cannot make:
     *
     * - `encounter.*` — vitals at check-in. D-033 says a clinician records
     *   them; the front desk does today. Waits on a `NURSE` clinician role.
     * - `prescription.*`, `dispense.write:any` — the admin pharmacy screens.
     * - `lab-*` — the "ADMIN covering the lab bench" row, which D-033 itself
     *   resolves as "not by default: a person who covers the bench is given
     *   `LAB_TECHNICIAN` explicitly", and which needs a migration note before
     *   it can ship.
     *
     * They are listed **here** rather than left out of
     * `CLINICAL_CONTENT_KEYS`, so each is a visible, dated exemption that a
     * follow-up deletes one line at a time — not a hole in the rule.
     */
    ADMIN: [
      'encounter.read:any',
      'encounter.write:any',
      'prescription.read:any',
      'prescription.write:any',
      'dispense.write:any',
      'lab-order.read:any',
      'lab-order.write:any',
      'lab-specimen.write:any',
      'lab-result.write:any',
      'lab-result.verify:any',
    ],
  };

  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');

  function collectGrants(roleCode: string): Set<string> {
    const pattern = new RegExp(`\\('${roleCode}', '([^']+)'\\)`, 'g');
    return new Set([...seedSql.matchAll(pattern)].map((match) => match[1] ?? ''));
  }

  /** Every role the seed grants anything to, read off the grant rows. */
  function collectSeededRoleCodes(): string[] {
    const matches = [...seedSql.matchAll(/\('([A-Z_]+)', '[a-z0-9.-]+:(?:any|own)'\)/g)];

    return [...new Set(matches.map((match) => match[1] ?? ''))];
  }

  it('grants clinical content only to clinicians and the two defined openings', () => {
    const offenders: string[] = [];
    for (const roleCode of collectSeededRoleCodes()) {
      if ((CLINICIAN_ROLE_CODES as readonly string[]).includes(roleCode)) {
        continue;
      }
      const allowed = TASK_ACCESS_ALLOWLIST[roleCode] ?? [];
      for (const key of collectGrants(roleCode)) {
        if (CLINICAL_CONTENT_KEYS.includes(key) && !allowed.includes(key)) {
          offenders.push(`${roleCode} → ${key}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the chat support view on session metadata and off message content', () => {
    const adminGrants = collectGrants('ADMIN');

    expect(adminGrants.has('chat.session.read:any')).toBe(true);
    expect(adminGrants.has('chat.message.read:any')).toBe(false);
  });

  it("takes the patient's clinical file off the front desk", () => {
    const adminGrants = collectGrants('ADMIN');

    expect(adminGrants.has('patient-document.read:any')).toBe(false);
    expect(adminGrants.has('patient-document.write:any')).toBe(false);
    expect(adminGrants.has('patient-document.delete:any')).toBe(false);
  });

  it('stops the SUPER_ADMIN catalogue-wide union at clinical content', () => {
    // SUPER_ADMIN is a platform and IT role, and D-033 gives it no break-glass
    // path: an emergency is handled by assigning a clinician. The union is
    // built in SQL, so the guard is that the exclusion is written there.
    expect(seedSql).toMatch(/NOT IN \(\s*SELECT "permission_key"\s*FROM clinical_content_keys/);
  });

  it('names every allowlisted key as clinical content, so the list cannot rot', () => {
    const allowlisted = Object.values(TASK_ACCESS_ALLOWLIST).flat();

    expect(allowlisted.every((key) => CLINICAL_CONTENT_KEYS.includes(key))).toBe(true);
  });

  it('stops the SUPER_ADMIN union at exactly the shared clinical-content list (P22-T04)', () => {
    // The IAM screen labels keys from `CLINICAL_CONTENT_PERMISSION_KEYS`; the
    // seed excludes them from SUPER_ADMIN by its own CTE. They must be one list.
    const start = seedSql.indexOf('clinical_content_keys(permission_key) AS (');
    const end = seedSql.indexOf('combined_role_permissions AS (', start);
    const seededKeys = [...seedSql.slice(start, end).matchAll(/\('([a-z0-9.:-]+)'\)/g)].map(
      (match) => match[1],
    );

    expect([...seededKeys].sort()).toEqual([...CLINICAL_CONTENT_PERMISSION_KEYS].sort());
  });

  it('holds every clinical content key as a real permission in the catalogue', () => {
    const missing = CLINICAL_CONTENT_KEYS.filter(
      (key) => !seedSql.includes(`('${key}',`),
    );

    expect(missing).toEqual([]);
  });
});
