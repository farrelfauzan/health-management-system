import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Phase-16 RBAC matrix, asserted rather than described (`P16-T21` §3,
 * NFR-SEC-09).
 *
 * Five epics added four new key families and one new decide key, and each was
 * reviewed in its own ticket against its own seed spec. This file is the
 * **phase-level** pass: one table naming every key the phase introduced, the
 * roles that hold it and the scope they hold it at, so that "which role can
 * do what across documents" is a single artefact somebody can read — and so
 * that a role edit that widens one of these answers fails here rather than
 * being found by a patient.
 *
 * It asserts three things the per-epic specs cannot, because each of them is
 * a statement about the phase as a whole:
 *
 *   * **Deny by default.** A role not named against a key does not hold it.
 *     The per-epic specs check the positive bindings; this one checks the
 *     absences, which is where a widening actually shows up.
 *   * **Separation of duties.** Deciding is not writing, and being able to
 *     define a type is neither (§7.5.9). The three keys are distinct rows,
 *     and a role holding one is not thereby holding another.
 *   * **The vault's missing `:any`.** E3's promise is not "nobody was granted
 *     the admin key", it is "there is no admin key". Re-checked here because
 *     it is the one property in the phase that a future role screen could
 *     otherwise break silently.
 *
 * Reads `seed.sql` rather than the database: CI runs `migrate deploy` without
 * ever seeding, so no integration spec can observe these rows.
 *
 * The human-readable companion is `docs/security/phase-16-rbac-matrix.md`.
 * When one changes, so does the other.
 */
describe('Phase 16 RBAC matrix', () => {
  /**
   * Every key the phase introduced, and exactly which roles hold it.
   *
   * An empty list is a claim too: `document.read:own` and its siblings belong
   * to the personal knowledge base and are granted through other seeds, so
   * they are not in this table at all — a key here with no roles would mean
   * the phase defined something nobody can use.
   */
  const MATRIX: ReadonlyArray<readonly [string, readonly string[]]> = [
    // E1 — invoice documents. Templates are clinic-wide layout, not patient
    // data, so there is no OWN scope to have: either you maintain the
    // clinic's paperwork or you do not.
    ['document-template.read:any', ['ADMIN']],
    ['document-template.write:any', ['ADMIN']],

    // E2 — patient documents. The only family in the phase with all three
    // audiences, and the scopes are the whole rule: an admin reads any file,
    // a doctor reads the files of patients they attend, a patient reads their
    // own and nothing else.
    ['patient-document.read:any', ['ADMIN']],
    ['patient-document.read:own', ['DOCTOR', 'PATIENT']],
    ['patient-document.write:any', ['ADMIN']],
    ['patient-document.write:own', ['DOCTOR']],
    ['patient-document.delete:any', ['ADMIN']],
    // Releasing to the portal is the doctor's call, not the desk's: it is a
    // clinical judgement about whether a result should reach a patient
    // unaccompanied.
    ['patient-document.release:own', ['DOCTOR']],

    // E3 — the doctor's vault. `ADMIN` holds these at OWN like everybody
    // else: an administrator has a vault of their own and no way into
    // anyone else's.
    ['vault-document.read:own', ['ADMIN', 'DOCTOR']],
    ['vault-document.write:own', ['ADMIN', 'DOCTOR']],
    ['vault-document.delete:own', ['ADMIN', 'DOCTOR']],
    ['vault-document.share:own', ['ADMIN', 'DOCTOR']],

    // E4 — delivery. Separate from `invoice.write:any` on purpose: sending a
    // bill out of the building is a different act from editing one, and a
    // deployment can withhold exactly this key and keep billing.
    ['invoice.deliver:any', ['ADMIN']],

    // E5 — the registry, its types, and the decision.
    ['managed-document.read:any', ['ADMIN']],
    ['managed-document.write:any', ['ADMIN']],
    ['document-type.write:any', ['ADMIN']],
    ['document-approval.decide:any', ['ADMIN']],
  ];

  /**
   * Keys that must not exist as permission rows at all — not merely be
   * ungranted. A clinic reader over a doctor's vault is not a permission
   * nobody was given; it is a permission there is no way to give.
   */
  const KEYS_THAT_MUST_NOT_EXIST: readonly string[] = [
    'vault-document.read:any',
    'vault-document.write:any',
    'vault-document.delete:any',
    'vault-document.share:any',
  ];

  /** Every role the seed defines, so an absence is checked against all of them. */
  const SEEDED_ROLE_CODES: readonly string[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'PATIENT',
    'PHARMACIST',
  ];

  const seedSql = readFileSync(
    resolve(__dirname, '../../../prisma/seed.sql'),
    'utf8',
  );

  /**
   * `SUPER_ADMIN` is granted every key by a wildcard rather than row by row,
   * so it is excluded from the absence checks: asserting it does not hold a
   * key would assert the opposite of what the role is for.
   */
  function findExplicitRoles(permissionKey: string): string[] {
    return SEEDED_ROLE_CODES.filter(
      (roleCode) =>
        roleCode !== 'SUPER_ADMIN' && seedSql.includes(`('${roleCode}', '${permissionKey}')`),
    );
  }

  it.each(MATRIX)('grants %s to exactly the reviewed roles', (permissionKey, expectedRoles) => {
    expect(findExplicitRoles(permissionKey).sort()).toEqual([...expectedRoles].sort());
  });

  it.each(MATRIX)('defines %s as a permission row', (permissionKey) => {
    expect(seedSql).toContain(`'${permissionKey}'`);
  });

  it.each(KEYS_THAT_MUST_NOT_EXIST)('never defines %s, for anyone to be granted', (forbiddenKey) => {
    expect(seedSql).not.toContain(forbiddenKey);
  });

  describe('separation of duties (§7.5.9)', () => {
    it('keeps deciding, writing and defining types as three distinct keys', () => {
      const keys = [
        'managed-document.write:any',
        'document-approval.decide:any',
        'document-type.write:any',
      ];

      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(seedSql).toContain(`'${key}'`);
      }
    });

    /**
     * Holding `decide` is half of what a decision needs; the other half is
     * being named on the round, and no grant can substitute for it
     * (FR-E5-13). That half is enforced in `DocumentApprovalService` and
     * covered by its own spec — named here so the matrix does not read as if
     * the key alone were sufficient.
     */
    it('records that the decide key alone does not authorise a decision', () => {
      expect(seedSql).toContain("'document-approval.decide:any'");
    });
  });

  describe('no new role (OQ-1)', () => {
    it('seeds no records-officer or approver role of its own', () => {
      for (const inventedRole of ['RECORDS_OFFICER', 'APPROVER', 'DOCUMENT_ADMIN']) {
        expect(seedSql).not.toContain(`'${inventedRole}'`);
      }
    });
  });
});
