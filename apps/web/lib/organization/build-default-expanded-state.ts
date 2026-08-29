import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import type { ExpandedState } from '@tanstack/react-table';

/**
 * Which branches are open before anyone touches the chart (SJ-90).
 *
 * Roots only. Expanding everything would reproduce the flat list this ticket
 * exists to replace, and collapsing everything would hide the structure behind
 * a row of names nobody recognises — a clinic's top level is four boxes, and
 * their children are what tells you what the place is.
 *
 * Keyed by unit id rather than by TanStack's default index path (`"0.1"`),
 * because the table sets `getRowId` to the unit's own id. That matters on every
 * refetch: a rename can change a unit's sort position, and an index-keyed set
 * would then reopen whichever branch happened to land at that index instead.
 */
export function buildDefaultExpandedState(roots: OrganizationUnitTreeNode[]): ExpandedState {
  return Object.fromEntries(roots.map((root) => [root.id, true]));
}
