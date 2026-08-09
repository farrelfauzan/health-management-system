import { listConversationsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListConversationsQueryDto extends createZodDto(listConversationsQuerySchema) {}
