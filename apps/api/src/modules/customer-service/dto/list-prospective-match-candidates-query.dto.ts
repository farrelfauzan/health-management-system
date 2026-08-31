import { listProspectiveMatchCandidatesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListProspectiveMatchCandidatesQueryDto extends createZodDto(
  listProspectiveMatchCandidatesQuerySchema,
) {}
