import { z } from 'zod';

/**
 * Role codes are the stable handle every other surface keys on — seed rows,
 * `assign-role`, `proxy.ts` portal gating — so they are SCREAMING_SNAKE and
 * immutable once created (`updateRoleSchema` deliberately omits `code`).
 */
export const roleCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Role code must be SCREAMING_SNAKE_CASE (A-Z, 0-9, _)');

/** `resource.action:scope`, e.g. `patient.read:any` — the seeded catalog shape. */
export const permissionKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(
    /^[a-z0-9-]+(\.[a-z0-9-]+)+:(any|own)$/,
    'Permission key must look like resource.action:scope',
  );

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleCode: z.string().min(1),
});

export const unassignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleCode: z.string().min(1),
});

export const createRoleSchema = z.object({
  code: roleCodeSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'At least one of name or description must be provided',
  });

export const setRolePermissionsSchema = z.object({
  permissionKeys: z.array(permissionKeySchema).max(500),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type UnassignRoleInput = z.infer<typeof unassignRoleSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;
