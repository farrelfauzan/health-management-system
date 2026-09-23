import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  describePermissionEffects,
  expandPermissionDependencies,
  ROLE_TEMPLATES,
} from '@hms/shared-types';

/**
 * P22-T05. A role created from a template must work with no further edits.
 * These are the conditions that made FRONT_NURSE fail on 2026-09-23, checked
 * against the seeded catalogue (CI never seeds, so this reads the file).
 */
describe('role templates', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'seed.sql'), 'utf8');
  const catalogKeys = new Set(
    [...seedSql.matchAll(/^\s*\('([a-z0-9.:-]+)', '[A-Za-z]+', '[a-z-]+', '(?:ANY|OWN)'/gm)].map(
      (match) => match[1] ?? '',
    ),
  );

  describe.each(ROLE_TEMPLATES.map((template) => [template.code, template] as const))(
    '%s',
    (_code, template) => {
      const keys = new Set(template.permissionKeys);
      const effects = template.permissionKeys.map((key) => ({
        key,
        ...describePermissionEffects(key),
      }));

      it('names only real catalogue keys', () => {
        expect(template.permissionKeys.filter((key) => !catalogKeys.has(key))).toEqual([]);
      });

      it('already holds everything its keys need, so saving it adds nothing', () => {
        const expanded = expandPermissionDependencies(keys, catalogKeys);

        expect([...expanded].filter((key) => !keys.has(key))).toEqual([]);
      });

      it('opens exactly one shell, the admin one', () => {
        expect(effects.flatMap((effect) => (effect.portal ? [effect.portal] : []))).toEqual([
          'ADMIN',
        ]);
      });

      it('asks no member to enrol MFA', () => {
        expect(effects.filter((effect) => effect.requiresMfa).map((effect) => effect.key)).toEqual(
          [],
        );
      });

      it('reaches no clinical content beyond triage vital signs (D-033)', () => {
        const clinicalKeys = effects
          .filter((effect) => effect.isClinicalContent)
          .map((effect) => effect.key);

        expect(clinicalKeys.filter((key) => key !== 'encounter.record-vitals:any')).toEqual([]);
      });
    },
  );

  it('gives the front-desk nurse vital signs and billing, as the ticket asks', () => {
    const nurse = ROLE_TEMPLATES.find((template) => template.code === 'FRONT_NURSE');

    expect(nurse?.permissionKeys).toEqual(
      expect.arrayContaining(['encounter.record-vitals:any', 'invoice.write:any']),
    );
  });
});
