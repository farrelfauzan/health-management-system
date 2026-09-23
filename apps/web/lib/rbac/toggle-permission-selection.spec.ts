import { describe, expect, it } from 'vitest';

import { resolveLockedPermissionKeys } from '#lib/rbac/resolve-locked-permission-keys';
import { summarizeRolePermissionEffects } from '#lib/rbac/summarize-role-permission-effects';
import { togglePermissionSelection } from '#lib/rbac/toggle-permission-selection';

const CATALOG_KEYS = new Set([
  'invoice.read:any',
  'invoice.write:any',
  'patient.read:any',
  'patient.merge:any',
  'portal.admin-access:any',
  'portal.doctor-access:any',
  'encounter.record-vitals:any',
  'role.assign:any',
]);

function toggle(selected: Set<string>, keys: string[]): Set<string> {
  return togglePermissionSelection({ selected, keys, catalogKeys: CATALOG_KEYS });
}

describe('togglePermissionSelection (P22-T04)', () => {
  it('ticks the read a write needs', () => {
    const actual = toggle(new Set(), ['invoice.write:any']);

    expect([...actual].sort()).toEqual(['invoice.read:any', 'invoice.write:any']);
  });

  it('ticks the admin portal for triage, whose only screen is there', () => {
    const actual = toggle(new Set(), ['encounter.record-vitals:any']);

    expect(actual.has('portal.admin-access:any')).toBe(true);
  });

  it('keeps a key another ticked key needs', () => {
    const inputSelection = new Set(['invoice.read:any', 'invoice.write:any']);

    const actual = toggle(inputSelection, ['invoice.read:any']);

    expect([...actual].sort()).toEqual(['invoice.read:any', 'invoice.write:any']);
  });

  it('unticks a key nothing else needs, without mutating the input', () => {
    const inputSelection = new Set(['invoice.read:any', 'invoice.write:any']);

    const actual = toggle(inputSelection, ['invoice.write:any']);

    expect([...actual]).toEqual(['invoice.read:any']);
    expect(inputSelection.size).toBe(2);
  });

  it('clears a group except the keys still needed from outside it', () => {
    const inputSelection = new Set([
      'patient.read:any',
      'patient.merge:any',
      'invoice.read:any',
      'invoice.write:any',
    ]);

    const actual = toggle(inputSelection, ['invoice.read:any', 'invoice.write:any']);

    expect([...actual].sort()).toEqual(['patient.merge:any', 'patient.read:any']);
  });
});

describe('resolveLockedPermissionKeys', () => {
  it('names which ticked keys hold a requirement in place', () => {
    const actual = resolveLockedPermissionKeys(
      new Set(['invoice.read:any', 'invoice.write:any']),
      CATALOG_KEYS,
    );

    expect(actual.get('invoice.read:any')).toEqual(['invoice.write:any']);
    expect(actual.has('invoice.write:any')).toBe(false);
  });
});

describe('summarizeRolePermissionEffects', () => {
  it('reports shells, MFA and clinical keys for the selection', () => {
    const actual = summarizeRolePermissionEffects(
      new Set([
        'portal.admin-access:any',
        'portal.doctor-access:any',
        'role.assign:any',
        'encounter.record-vitals:any',
      ]),
    );

    expect(actual.portals).toEqual(['ADMIN', 'DOCTOR']);
    expect(actual.mfaKeys).toEqual(['role.assign:any']);
    expect(actual.clinicalKeys).toEqual(['encounter.record-vitals:any']);
  });
});
