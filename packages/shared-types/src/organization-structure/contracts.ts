import type { OrganizationUnitKindValue } from '#organization-structure/schemas';

/**
 * One unit as the org-chart screen draws it (SJ-1).
 *
 * `memberCount` counts staff whose `organizationUnitId` is this unit — this
 * unit only, never its descendants. A rolled-up total would make "3 people" on
 * a division mean something different from "3 people" on a team, and the screen
 * shows both side by side. It is returned with the tree so rendering a chart
 * costs one request, and so the archive dialog can say what is about to be
 * refused before the caller tries.
 *
 * `depth` is derived from the stored path rather than persisted, and is
 * 1-based: a root is at depth 1.
 */
export type OrganizationUnitResponse = {
  id: string;
  parentId: string | null;
  name: string;
  kind: OrganizationUnitKindValue;
  depth: number;
  sortOrder: number;
  memberCount: number;
  /** Present only when the unit is archived, so the UI can mark it. */
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * A unit with its descendants nested underneath, ordered by `sortOrder` then
 * `name` at every level.
 *
 * Nested rather than flat because every consumer renders a tree, and a client
 * handed a flat list would have to rebuild the parent/child structure the API
 * already knows — the same reasoning as `WardOccupancyResponse`.
 */
export type OrganizationUnitTreeNode = OrganizationUnitResponse & {
  children: OrganizationUnitTreeNode[];
};

/**
 * The whole chart. `roots` rather than a single root because a clinic may run
 * several top-level structures — a hospital and its outpatient branch — with
 * no artificial node invented to join them.
 */
export type OrganizationUnitTreeResponse = {
  roots: OrganizationUnitTreeNode[];
  /** How many units the tree holds, archived ones included only when asked for. */
  totalUnits: number;
  /** Deepest level present, so the UI can warn as the cap approaches. */
  maxDepth: number;
};

/**
 * One person sitting in a unit (SJ-89).
 *
 * Roles ride along because the members list is read next to them — "who is in
 * Nursing" is nearly always followed by "and what are they" — and the caller
 * would otherwise fan out to the admin-users endpoint once per row.
 */
export type OrganizationUnitMemberResponse = {
  userId: string;
  email: string;
  isActive: boolean;
  roles: string[];
};

export type OrganizationUnitMemberListMeta = {
  page: number;
  limit: number;
  total: number;
};
