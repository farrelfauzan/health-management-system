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

/**
 * Narrows the matrix to the rows whose title — the action shown on the row —
 * matches the query. Descriptions, permission keys, and resource names are
 * deliberately not searched, so a hit is always visible in the row it filters
 * to. Blocks left with no matching row drop out.
 */
export function filterPermissionMatrix(
  groups: PermissionMatrixGroup[],
  query: string,
): PermissionMatrixGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return groups;
  }
  return groups
    .map((group) => ({
      resource: group.resource,
      rows: group.rows.filter((row) => row.action.toLowerCase().includes(normalizedQuery)),
    }))
    .filter((group) => group.rows.length > 0);
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

export function getGroupKeys(group: PermissionMatrixGroup): string[] {
  return group.rows.flatMap((row) => [row.anyKey, row.ownKey].filter((key) => key !== undefined));
}

export function isGroupFullySelected(
  group: PermissionMatrixGroup,
  selected: ReadonlySet<string>,
): boolean {
  const keys = getGroupKeys(group);
  return keys.length > 0 && keys.every((key) => selected.has(key));
}

export function toggleGroupKeys(
  selected: ReadonlySet<string>,
  group: PermissionMatrixGroup,
): Set<string> {
  const keys = getGroupKeys(group);
  const next = new Set(selected);
  if (isGroupFullySelected(group, selected)) {
    keys.forEach((key) => next.delete(key));
  } else {
    keys.forEach((key) => next.add(key));
  }
  return next;
}
