import { z } from 'zod';

/**
 * MAINTENANCE is deliberately distinct from a retired bed: a bed being cleaned
 * or repaired is still inventory the occupancy board must show, while a
 * retired one has left the ward.
 */
export const BED_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'] as const;

export const bedStatusSchema = z.enum(BED_STATUSES);

export type BedStatusValue = z.infer<typeof bedStatusSchema>;

/**
 * OCCUPIED is absent from what a caller may set. It is a projection of the
 * live `BedAssignment` set maintained by the admit/transfer/discharge
 * transactions (IMP-14) — letting an inventory edit write it would let someone
 * free a bed a patient is lying in without discharging them.
 */
export const SETTABLE_BED_STATUSES = ['AVAILABLE', 'MAINTENANCE'] as const;

export const settableBedStatusSchema = z.enum(SETTABLE_BED_STATUSES);

export type SettableBedStatusValue = z.infer<typeof settableBedStatusSchema>;

const MAX_CODE_LENGTH = 32;

const MAX_NAME_LENGTH = 255;

const MAX_DESCRIPTION_LENGTH = 1000;

const MAX_SEARCH_LENGTH = 100;

const DEFAULT_PAGE_SIZE = 10;

const MAX_PAGE_SIZE = 100;

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CODE_LENGTH)
  // Codes are spoken out loud on a ward round and typed into a search box, so
  // they stay in the character set a keyboard reaches without thinking.
  .regex(/^[A-Za-z0-9][A-Za-z0-9\-_.]*$/, 'Code may contain letters, digits, dot, dash, underscore');

const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);

const descriptionSchema = z.string().trim().max(MAX_DESCRIPTION_LENGTH);

const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/**
 * A class quota is a planned bed count for the whole clinic. Capped rather
 * than unbounded because the number is typed by hand, and a four-digit typo
 * would silently turn a ceiling into no ceiling at all.
 */
const MAX_ROOM_CLASS_QUOTA = 9999;

export const createRoomClassSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
  /**
   * Omitted means uncapped. `null` is not accepted on create for the same
   * reason: there is nothing to clear yet, and two spellings of "no quota"
   * would be two things a reader has to check for.
   */
  quota: z.coerce.number().int().min(1).max(MAX_ROOM_CLASS_QUOTA).optional(),
  isActive: z.boolean().optional(),
});

export const updateRoomClassSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    /** `null` clears the quota, which is how a clinic says "uncapped" again. */
    quota: z.coerce.number().int().min(1).max(MAX_ROOM_CLASS_QUOTA).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  // `code` is absent for the same reason as on a ward: it is the handle the
  // seed converges on and the accommodation tariff points at, so renaming it
  // would re-point a price at nothing. `name` is the field a clinic renames.
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listRoomClassesQuerySchema = z.object({
  ...paginationShape,
  search: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional(),
  isActive: booleanQuerySchema,
});

export const createWardSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
  isActive: z.boolean().optional(),
});

export const updateWardSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  // `code` is deliberately not updatable. It is what a bed is called on the
  // floor plan and in every discharge summary already written; renaming it
  // would silently rewrite the address of stays that have already happened.
  // Retire the ward and create its replacement instead — which is why the
  // unique index is partial on `deleted_at`.
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listWardsQuerySchema = z.object({
  ...paginationShape,
  search: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional(),
  isActive: booleanQuerySchema,
});

export const createRoomSchema = z.object({
  wardId: z.string().uuid(),
  roomClassId: z.string().uuid(),
  code: codeSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
  isActive: z.boolean().optional(),
});

export const updateRoomSchema = z
  .object({
    name: nameSchema.optional(),
    roomClassId: z.string().uuid().optional(),
    description: descriptionSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listRoomsQuerySchema = z.object({
  ...paginationShape,
  wardId: z.string().uuid().optional(),
  roomClassId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional(),
  isActive: booleanQuerySchema,
});

export const createBedSchema = z.object({
  roomId: z.string().uuid(),
  code: codeSchema,
  status: settableBedStatusSchema.optional(),
  notes: descriptionSchema.optional(),
});

export const updateBedSchema = z
  .object({
    status: settableBedStatusSchema.optional(),
    notes: descriptionSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listBedsQuerySchema = z.object({
  ...paginationShape,
  wardId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  status: bedStatusSchema.optional(),
  search: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional(),
});

export const roomOccupancyQuerySchema = z.object({
  wardId: z.string().uuid().optional(),
  roomClassId: z.string().uuid().optional(),
});

export type CreateRoomClassInput = z.infer<typeof createRoomClassSchema>;
export type UpdateRoomClassInput = z.infer<typeof updateRoomClassSchema>;
export type ListRoomClassesQueryInput = z.infer<typeof listRoomClassesQuerySchema>;
export type CreateWardInput = z.infer<typeof createWardSchema>;
export type UpdateWardInput = z.infer<typeof updateWardSchema>;
export type ListWardsQueryInput = z.infer<typeof listWardsQuerySchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type ListRoomsQueryInput = z.infer<typeof listRoomsQuerySchema>;
export type CreateBedInput = z.infer<typeof createBedSchema>;
export type UpdateBedInput = z.infer<typeof updateBedSchema>;
export type ListBedsQueryInput = z.infer<typeof listBedsQuerySchema>;
export type RoomOccupancyQueryInput = z.infer<typeof roomOccupancyQuerySchema>;
