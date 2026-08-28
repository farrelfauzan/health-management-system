import { z } from 'zod';

/**
 * What a unit is called on the chart (SJ-1). A label, not a structural rule:
 * nothing constrains what may nest inside what, because a clinic that puts a
 * team under a branch is as ordinary as one that puts it under a department,
 * and a hierarchy enforcing one ordering would be wrong for the next clinic.
 */
export const ORGANIZATION_UNIT_KINDS = ['DIVISION', 'DEPARTMENT', 'TEAM', 'BRANCH'] as const;

export const organizationUnitKindSchema = z.enum(ORGANIZATION_UNIT_KINDS);

export type OrganizationUnitKindValue = z.infer<typeof organizationUnitKindSchema>;

/**
 * How deep the tree may go, counting the root as level 1.
 *
 * A cap exists because `path` is recomputed for a whole subtree on every move
 * and the depth bounds that work, but the number is a judgement about org
 * charts rather than about the query: six levels is division → department →
 * team with room to spare, and a clinic that needs a seventh is describing
 * something the chart is the wrong tool for. Google Workspace allows ~35 and
 * reports that almost nobody passes four.
 */
export const MAX_ORGANIZATION_UNIT_DEPTH = 6;

const MAX_NAME_LENGTH = 255;

const MAX_SORT_ORDER = 9999;

const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);

/**
 * Ordering among siblings. Bounded because the value is typed by hand and an
 * unbounded integer would let one typo push a unit permanently to the end.
 */
const sortOrderSchema = z.coerce.number().int().min(0).max(MAX_SORT_ORDER);

export const createOrganizationUnitSchema = z.object({
  name: nameSchema,
  kind: organizationUnitKindSchema,
  /**
   * Omitted or `null` creates a root. Both spellings are accepted here — unlike
   * the update schema, where they mean different things — because a caller
   * building a root has no parent to speak of and should not have to know
   * which of the two the API prefers.
   */
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const updateOrganizationUnitSchema = z
  .object({
    name: nameSchema.optional(),
    kind: organizationUnitKindSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  // `parentId` is deliberately absent: re-parenting rewrites `path` for every
  // descendant and is refused for cycles and depth, so it is its own endpoint
  // with its own audit verb. Letting it ride along in a rename would make a
  // reorganisation indistinguishable from a typo fix in the audit log.
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const moveOrganizationUnitSchema = z.object({
  /**
   * `null` promotes the unit to a root. Required rather than optional, because
   * an omitted parent on a *move* is ambiguous in a way it is not on a create:
   * it could mean "make this a root" or "leave the parent alone", and the two
   * are opposite reorganisations.
   */
  parentId: z.string().uuid().nullable(),
  sortOrder: sortOrderSchema.optional(),
});

export const listOrganizationUnitsQuerySchema = z.object({
  /**
   * Return only this unit and its descendants. Absent means the whole tree —
   * the ordinary case, since the screen renders all of it at once.
   */
  rootId: z.string().uuid().optional(),
  /**
   * Include archived units. Off by default, so an archived branch disappears
   * from the chart without a caller having to filter it out.
   */
  includeArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type CreateOrganizationUnitInput = z.infer<typeof createOrganizationUnitSchema>;
export type UpdateOrganizationUnitInput = z.infer<typeof updateOrganizationUnitSchema>;
export type MoveOrganizationUnitInput = z.infer<typeof moveOrganizationUnitSchema>;
export type ListOrganizationUnitsQueryInput = z.infer<typeof listOrganizationUnitsQuerySchema>;
