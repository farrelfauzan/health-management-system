import type { OrganizationUnitTreeNode } from '@hms/shared-types';

/**
 * The ids of a unit and everything under it.
 *
 * The move picker uses this to leave out destinations the API would refuse
 * with `ORGANIZATION_UNIT_CYCLE`. That is a convenience, not the rule: the
 * backend runs the same check against the stored tree on every move, and this
 * list is only as fresh as the tree the browser last fetched.
 */
export function collectSubtreeIds(unit: OrganizationUnitTreeNode): Set<string> {
  const ids = new Set<string>([unit.id]);
  for (const child of unit.children) {
    for (const descendantId of collectSubtreeIds(child)) {
      ids.add(descendantId);
    }
  }
  return ids;
}
