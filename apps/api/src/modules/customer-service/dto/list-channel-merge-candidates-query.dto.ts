import { listChannelMergeCandidatesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListChannelMergeCandidatesQueryDto extends createZodDto(
  listChannelMergeCandidatesQuerySchema,
) {}
