import type { OrganizationUnitKindValue } from '#organization-structure/schemas';

/**
 * Repository projection of one unit row (SJ-1).
 *
 * `path` is carried through to the service because every structural rule reads
 * it — depth is its segment count, ancestry is its prefix, and a move rewrites
 * it for the subtree. It is never returned to a client: it is a chain of
 * internal ids that says nothing the nested tree does not already say.
 */
export type OrganizationUnitRecord = {
  id: string;
  parentId: string | null;
  name: string;
  kind: OrganizationUnitKindValue;
  path: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/** How many staff sit directly in one unit. */
export type OrganizationUnitMemberTallyRecord = {
  organizationUnitId: string;
  count: number;
};

export type ListOrganizationUnitsParams = {
  rootId?: string;
  includeArchived?: boolean;
};

export type CreateOrganizationUnitRecordPayload = {
  name: string;
  kind: OrganizationUnitKindValue;
  parentId: string | null;
  path: string;
  sortOrder: number;
};

export type UpdateOrganizationUnitRecordPayload = {
  id: string;
  name?: string;
  kind?: OrganizationUnitKindValue;
  sortOrder?: number;
};

/**
 * One node's new address after a move. The service computes the whole set for
 * the subtree and the repository writes them in a single transaction, because a
 * tree observed with half its paths rewritten would report ancestry that
 * contradicts `parentId`.
 */
export type OrganizationUnitPathUpdate = {
  id: string;
  path: string;
};

export type MoveOrganizationUnitRecordPayload = {
  id: string;
  parentId: string | null;
  sortOrder?: number;
  pathUpdates: OrganizationUnitPathUpdate[];
};

/** Repository projection of one member row (SJ-89). */
export type OrganizationUnitMemberRecord = {
  userId: string;
  email: string;
  isActive: boolean;
  roles: string[];
  /** Which unit the person sits in, so a reassignment can name the old one. */
  organizationUnitId: string | null;
};

export type ListOrganizationUnitMembersParams = {
  organizationUnitId: string;
  page: number;
  limit: number;
  search?: string;
};

/**
 * Paged repository result for the members list. Mirrors the room module's
 * `PagedRecords`, but declared here rather than imported so the two domains
 * stay independent.
 */
export type PagedOrganizationUnitMembers = {
  items: OrganizationUnitMemberRecord[];
  page: number;
  limit: number;
  total: number;
};
