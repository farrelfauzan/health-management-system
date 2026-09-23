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
 * Folds text for search: lowercase with every non-alphanumeric dropped, so
 * "lab order", "LabOrder", and "lab-order.read" compare equal.
 */
function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRowMatchingQuery(
  resource: string,
  row: PermissionMatrixRow,
  normalizedQuery: string,
): boolean {
  const searchableTexts = [resource, row.action, row.description, row.anyKey, row.ownKey];
  return searchableTexts.some(
    (text) => text !== undefined && normalizeSearchText(text).includes(normalizedQuery),
  );
}

/**
 * Narrows the matrix to the rows matching the query on the resource name, the
 * action, the description, or a permission key (e.g. `patient.read:own`), so
 * both "patient" and "read" find something. Case, spaces, and punctuation are
 * ignored. Blocks left with no matching row drop out.
 */
export function filterPermissionMatrix(
  groups: PermissionMatrixGroup[],
  query: string,
): PermissionMatrixGroup[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return groups;
  }
  return groups
    .map((group) => ({
      resource: group.resource,
      rows: group.rows.filter((row) => isRowMatchingQuery(group.resource, row, normalizedQuery)),
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
