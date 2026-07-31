import { createChatSessionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateChatSessionDto extends createZodDto(createChatSessionSchema) {}
