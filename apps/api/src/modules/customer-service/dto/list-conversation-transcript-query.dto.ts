import { listConversationTranscriptQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListConversationTranscriptQueryDto extends createZodDto(
  listConversationTranscriptQuerySchema,
) {}
