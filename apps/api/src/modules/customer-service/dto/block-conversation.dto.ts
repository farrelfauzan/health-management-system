import { blockConversationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class BlockConversationDto extends createZodDto(blockConversationSchema) {}
