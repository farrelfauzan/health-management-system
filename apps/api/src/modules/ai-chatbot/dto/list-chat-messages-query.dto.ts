import { listChatMessagesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListChatMessagesQueryDto extends createZodDto(listChatMessagesQuerySchema) {}
