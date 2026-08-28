import type { OrganizationUnitTreeNode } from '@hms/shared-types';

export type FlatOrganizationUnit = {
  unit: OrganizationUnitTreeNode;
  /** 0 for a root, incremented per level — what the row indents by. */
  indent: number;
  /** True for the last child of its parent, so the row can close the guides. */
  isLastSibling: boolean;
};

/**
 * Flattens the nested tree into the row list a table renders, in the order a
 * reader scans it: each unit immediately followed by its own subtree.
 *
 * The table stays flat rather than nesting `<table>`s because a nested table
 * cannot keep columns aligned across branches — "Members" would sit at a
 * different x-position on every level. Indentation carries the hierarchy
 * instead, which is also what makes the whole chart one scannable list.
 */
export function flattenOrganizationTree(
  roots: OrganizationUnitTreeNode[],
  indent = 0,
): FlatOrganizationUnit[] {
  return roots.flatMap((unit, index) => [
    { unit, indent, isLastSibling: index === roots.length - 1 },
    ...flattenOrganizationTree(unit.children, indent + 1),
  ]);
}
