import { z } from 'zod';

export const listSpecialtiesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListSpecialtiesQueryInput = z.infer<typeof listSpecialtiesQuerySchema>;
