import { replyToConversationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ReplyToConversationDto extends createZodDto(replyToConversationSchema) {}
