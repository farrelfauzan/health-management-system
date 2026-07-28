import { z } from 'zod';

export const ICD10_CODE_SEARCH_DEFAULT_LIMIT = 20;

export const ICD10_CODE_SEARCH_MAX_LIMIT = 100;

/**
 * Query for the ICD-10 lookup. This is a type-ahead, not a browsable list, so
 * it takes a `limit` and no page cursor: a clinician refines the term instead
 * of paging through thousands of codes.
 */
export const searchIcd10CodesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ICD10_CODE_SEARCH_MAX_LIMIT)
    .default(ICD10_CODE_SEARCH_DEFAULT_LIMIT),
});

export type SearchIcd10CodesQueryInput = z.infer<typeof searchIcd10CodesQuerySchema>;
