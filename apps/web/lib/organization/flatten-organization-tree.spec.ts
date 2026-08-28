import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { flattenOrganizationTree } from './flatten-organization-tree';

function buildNode(
  id: string,
  depth: number,
  children: OrganizationUnitTreeNode[] = [],
): OrganizationUnitTreeNode {
  return {
    id,
    parentId: null,
    name: id,
    kind: 'TEAM',
    depth,
    sortOrder: 0,
    memberCount: 0,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    children,
  };
}

describe('flattenOrganizationTree', () => {
  it('returns an empty list for an empty tree', () => {
    expect(flattenOrganizationTree([])).toEqual([]);
  });

  it('emits each unit immediately before its own subtree', () => {
    // Depth-first, not breadth-first: the table is read top to bottom, so a
    // child must sit directly under its parent rather than after every sibling.
    const tree = [
      buildNode('a', 1, [buildNode('a1', 2, [buildNode('a1x', 3)]), buildNode('a2', 2)]),
      buildNode('b', 1),
    ];

    const actual = flattenOrganizationTree(tree);

    expect(actual.map((row) => row.unit.id)).toEqual(['a', 'a1', 'a1x', 'a2', 'b']);
  });

  it('indents one step per level, starting roots at zero', () => {
    const tree = [buildNode('a', 1, [buildNode('a1', 2, [buildNode('a1x', 3)])])];

    const actual = flattenOrganizationTree(tree);

    expect(actual.map((row) => row.indent)).toEqual([0, 1, 2]);
  });

  it('marks only the last child of each parent as the last sibling', () => {
    const tree = [
      buildNode('a', 1, [buildNode('a1', 2), buildNode('a2', 2)]),
      buildNode('b', 1),
    ];

    const actual = flattenOrganizationTree(tree);

    expect(
      actual.map((row) => [row.unit.id, row.isLastSibling] as const),
    ).toEqual([
      ['a', false],
      ['a1', false],
      ['a2', true],
      ['b', true],
    ]);
  });
});
