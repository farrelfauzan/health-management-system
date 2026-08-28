import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { collectSubtreeIds } from './collect-subtree-ids';

function buildNode(
  id: string,
  children: OrganizationUnitTreeNode[] = [],
): OrganizationUnitTreeNode {
  return {
    id,
    parentId: null,
    name: id,
    kind: 'TEAM',
    depth: 1,
    sortOrder: 0,
    memberCount: 0,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    children,
  };
}

describe('collectSubtreeIds', () => {
  it('includes the unit itself, so it cannot be offered as its own parent', () => {
    expect([...collectSubtreeIds(buildNode('a'))]).toEqual(['a']);
  });

  it('collects descendants at every depth', () => {
    // The picker has to exclude a grandchild as well as a child: moving a unit
    // under its own grandchild is the same cycle, one hop further away.
    const tree = buildNode('a', [buildNode('a1', [buildNode('a1x')]), buildNode('a2')]);

    const actual = collectSubtreeIds(tree);

    expect([...actual].sort()).toEqual(['a', 'a1', 'a1x', 'a2']);
  });
});
