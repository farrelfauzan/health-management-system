import { sendChatMessageSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SendChatMessageDto extends createZodDto(sendChatMessageSchema) {}
