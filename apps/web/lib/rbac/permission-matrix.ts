import type { PermissionCatalogGroup } from '@hms/shared-types';

export type PermissionMatrixRow = {
  action: string;
  description?: string;
  /** Catalog key for the ANY scope, when the catalog defines one. */
  anyKey?: string;
  /** Catalog key for the OWN scope, when the catalog defines one. */
  ownKey?: string;
};

export type PermissionMatrixGroup = {
  resource: string;
  rows: PermissionMatrixRow[];
};

/**
 * Reshapes the catalog for a matrix UI: one row per resource+action, with the
 * ANY and OWN keys side by side so each scope renders as a column. A scope the
 * catalog does not define stays undefined — the cell renders empty, because a
 * grant that cannot exist must not be offered.
 */
export function buildPermissionMatrix(groups: PermissionCatalogGroup[]): PermissionMatrixGroup[] {
  return groups.map((group) => {
    const rowsByAction = new Map<string, PermissionMatrixRow>();
    for (const permission of group.permissions) {
      const row = rowsByAction.get(permission.action) ?? { action: permission.action };
      if (permission.scope === 'ANY') {
        row.anyKey = permission.permissionKey;
      } else {
        row.ownKey = permission.permissionKey;
      }
      row.description = row.description ?? permission.description;
      rowsByAction.set(permission.action, row);
    }
    return { resource: group.resource, rows: Array.from(rowsByAction.values()) };
  });
}

export function togglePermissionKey(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

export function countSelectedInGroup(
  group: PermissionMatrixGroup,
  selected: ReadonlySet<string>,
): number {
  return group.rows.reduce((count, row) => {
    const anySelected = row.anyKey !== undefined && selected.has(row.anyKey) ? 1 : 0;
    const ownSelected = row.ownKey !== undefined && selected.has(row.ownKey) ? 1 : 0;
    return count + anySelected + ownSelected;
  }, 0);
}
