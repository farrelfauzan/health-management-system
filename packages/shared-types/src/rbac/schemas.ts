import { z } from 'zod';

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleCode: z.string().min(1),
});

export const unassignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleCode: z.string().min(1),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type UnassignRoleInput = z.infer<typeof unassignRoleSchema>;
