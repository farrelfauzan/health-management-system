import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { buildDefaultExpandedState } from './build-default-expanded-state';

function buildNode(
  id: string,
  children: OrganizationUnitTreeNode[] = [],
): OrganizationUnitTreeNode {
  return {
    id,
    parentId: null,
    name: id,
    kind: 'DIVISION',
    depth: 1,
    sortOrder: 0,
    memberCount: 0,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    children,
  };
}

describe('buildDefaultExpandedState', () => {
  it('opens every root and nothing deeper', () => {
    // Expanding everything would reproduce the flat list this replaced;
    // collapsing everything would hide the structure behind four names.
    const actual = buildDefaultExpandedState([
      buildNode('a', [buildNode('a1', [buildNode('a1x')])]),
      buildNode('b'),
    ]);

    // Keyed by unit id, not by index path: the expanded set is persisted, and
    // an index would reopen a different branch after a rename or reorder.
    expect(actual).toEqual({ a: true, b: true });
  });

  it('returns nothing to expand for an empty tree', () => {
    expect(buildDefaultExpandedState([])).toEqual({});
  });
});
