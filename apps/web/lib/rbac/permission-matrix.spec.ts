import { describe, expect, it } from 'vitest';

import type { PermissionCatalogGroup } from '@hms/shared-types';

import {
  buildPermissionMatrix,
  countSelectedInGroup,
  filterPermissionMatrix,
  isGroupFullySelected,
  toggleGroupKeys,
  togglePermissionKey,
} from '#lib/rbac/permission-matrix';

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
      },
      {
        id: 'p2',
        permissionKey: 'patient.read:own',
        resource: 'Patient',
        action: 'read',
        scope: 'OWN',
        description: 'Read own patient record',
      },
      {
        id: 'p3',
        permissionKey: 'patient.merge:any',
        resource: 'Patient',
        action: 'merge',
        scope: 'ANY',
        description: 'Merge duplicate patients',
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
      },
      { action: 'merge', description: 'Merge duplicate patients', anyKey: 'patient.merge:any' },
    ]);
  });

  it('leaves an undefined cell for a scope the catalog does not define', () => {
    const actualMatrix = buildPermissionMatrix([buildCatalogGroup()]);
    const mergeRow = actualMatrix[0]?.rows.find((row) => row.action === 'merge');

    expect(mergeRow?.ownKey).toBeUndefined();
  });
});

describe('togglePermissionKey', () => {
  it('adds a missing key and removes a present one without mutating the input', () => {
    const inputSelection = new Set(['patient.read:any']);

    const withMerge = togglePermissionKey(inputSelection, 'patient.merge:any');
    const withoutRead = togglePermissionKey(withMerge, 'patient.read:any');

    expect(Array.from(withMerge).sort()).toEqual(['patient.merge:any', 'patient.read:any']);
    expect(Array.from(withoutRead)).toEqual(['patient.merge:any']);
    expect(Array.from(inputSelection)).toEqual(['patient.read:any']);
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

  it('does not match on the description', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    expect(filterPermissionMatrix(inputMatrix, 'duplicate')).toEqual([]);
  });

  it('does not match on the permission key', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    expect(filterPermissionMatrix(inputMatrix, 'read:own')).toEqual([]);
  });

  it('does not match on the resource name', () => {
    const inputMatrix = buildPermissionMatrix([buildCatalogGroup()]);

    expect(filterPermissionMatrix(inputMatrix, 'patient')).toEqual([]);
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

describe('toggleGroupKeys', () => {
  it('selects every key in the group when not fully selected, without mutating the input', () => {
    const matrixGroup = buildPermissionMatrix([buildCatalogGroup()])[0];
    const inputSelection = new Set(['patient.read:any']);

    const actualSelection = matrixGroup && toggleGroupKeys(inputSelection, matrixGroup);

    expect(actualSelection && Array.from(actualSelection).sort()).toEqual([
      'patient.merge:any',
      'patient.read:any',
      'patient.read:own',
    ]);
    expect(Array.from(inputSelection)).toEqual(['patient.read:any']);
  });

  it('clears every key in the group when fully selected', () => {
    const matrixGroup = buildPermissionMatrix([buildCatalogGroup()])[0];
    const inputSelection = new Set([
      'patient.read:any',
      'patient.read:own',
      'patient.merge:any',
    ]);

    const actualSelection = matrixGroup && toggleGroupKeys(inputSelection, matrixGroup);

    expect(actualSelection && Array.from(actualSelection)).toEqual([]);
  });
});
