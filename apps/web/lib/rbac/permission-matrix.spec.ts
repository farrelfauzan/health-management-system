import { describe, expect, it } from 'vitest';

import type { PermissionCatalogGroup } from '@hms/shared-types';

import {
  buildPermissionMatrix,
  countSelectedInGroup,
  filterPermissionMatrix,
  isGroupFullySelected,
} from '#lib/rbac/permission-matrix';

const NO_EFFECTS = { requiresMfa: false, portal: null, isClinicalContent: false };

function buildCatalogGroup(): PermissionCatalogGroup {
  return {
    resource: 'Patient',
    permissions: [
      {
        id: 'p1',
        permissionKey: 'patient.read:any',
        resource: 'Patient',
        action: 'read',
        scope: 'ANY',
        description: 'Read all patients',
        requires: [],
        effects: NO_EFFECTS,
      },
      {
        id: 'p2',
        permissionKey: 'patient.read:own',
        resource: 'Patient',
        action: 'read',
        scope: 'OWN',
        description: 'Read own patient record',
        requires: [],
        effects: NO_EFFECTS,
      },
      {
        id: 'p3',
        permissionKey: 'patient.merge:any',
        resource: 'Patient',
        action: 'merge',
        scope: 'ANY',
        description: 'Merge duplicate patients',
        requires: [],
        effects: NO_EFFECTS,
      },
    ],
  };
}

describe('buildPermissionMatrix', () => {
  it('folds both scopes of one action into a single row', () => {
    const actualMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    expect(actualMatrix).toHaveLength(1);
    expect(actualMatrix[0]?.rows).toEqual([
      {
        action: 'read',
        description: 'Read all patients',
        anyKey: 'patient.read:any',
        ownKey: 'patient.read:own',
        anyEffects: NO_EFFECTS,
        ownEffects: NO_EFFECTS,
      },
      {
        action: 'merge',
        description: 'Merge duplicate patients',
        anyKey: 'patient.merge:any',
        anyEffects: NO_EFFECTS,
      },
    ]);
  });

  it('leaves an undefined cell for a scope the catalog does not define', () => {
    const actualMatrix = buildPermissionMatrix([buildCatalogGroup()]);
    const mergeRow = actualMatrix[0]?.rows.find((row) => row.action === 'merge');

    expect(mergeRow?.ownKey).toBeUndefined();
  });
});

describe('countSelectedInGroup', () => {
  it('counts each selected scope cell once', () => {
    const matrixGroup = buildPermissionMatrix([buildCatalogGroup()])[0];
    const selected = new Set(['patient.read:any', 'patient.read:own', 'patient.merge:any']);

    expect(matrixGroup && countSelectedInGroup(matrixGroup, selected)).toBe(3);
  });
});

describe('filterPermissionMatrix', () => {
  it('returns every group untouched for a blank query', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    expect(filterPermissionMatrix(inputMatrix, '   ')).toEqual(inputMatrix);
  });

  it('keeps only the rows whose title matches, ignoring case', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    const actualMatrix = filterPermissionMatrix(inputMatrix, 'MERGE');

    expect(actualMatrix).toHaveLength(1);
    expect(actualMatrix[0]?.rows.map((row) => row.action)).toEqual(['merge']);
  });

  it('matches on the description', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    const actualMatrix = filterPermissionMatrix(inputMatrix, 'duplicate');

    expect(actualMatrix[0]?.rows.map((row) => row.action)).toEqual(['merge']);
  });

  it('matches on the permission key', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    const actualMatrix = filterPermissionMatrix(inputMatrix, 'patient.read:own');

    expect(actualMatrix[0]?.rows.map((row) => row.action)).toEqual(['read']);
  });

  it('keeps every row of a group whose resource name matches', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    const actualMatrix = filterPermissionMatrix(inputMatrix, 'patient');

    expect(actualMatrix[0]?.rows.map((row) => row.action)).toEqual(['read', 'merge']);
  });

  it('ignores spaces and punctuation between words', () => {
    const inputMatrix = buildPermissionMatrix([
      {
        resource: 'LabOrder',
        permissions: [
          {
            id: 'l1',
            permissionKey: 'lab-order.read:any',
            resource: 'LabOrder',
            action: 'read',
            scope: 'ANY',
            description: 'Read every laboratory order',
            requires: [],
            effects: NO_EFFECTS,
          },
        ],
      },
    ]);

    expect(filterPermissionMatrix(inputMatrix, 'lab order')).toHaveLength(1);
    expect(filterPermissionMatrix(inputMatrix, 'lab-order.read')).toHaveLength(1);
  });

  it('drops groups that have no matching row', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    expect(filterPermissionMatrix(inputMatrix, 'invoice')).toEqual([]);
  });
});

describe('isGroupFullySelected', () => {
  it('is false when at least one key in the group is missing', () => {
    const matrixGroup = buildPermissionMatrix([buildCatalogGroup()])[0];
    const selected = new Set(['patient.read:any', 'patient.read:own']);

    expect(matrixGroup && isGroupFullySelected(matrixGroup, selected)).toBe(false);
  });

  it('is true when every key in the group is selected', () => {
    const matrixGroup = buildPermissionMatrix([buildCatalogGroup()])[0];
    const selected = new Set(['patient.read:any', 'patient.read:own', 'patient.merge:any']);

    expect(matrixGroup && isGroupFullySelected(matrixGroup, selected)).toBe(true);
  });
});
