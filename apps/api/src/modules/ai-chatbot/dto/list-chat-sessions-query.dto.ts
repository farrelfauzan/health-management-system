import { listChatSessionsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListChatSessionsQueryDto extends createZodDto(listChatSessionsQuerySchema) {}
