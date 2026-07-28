import { queueBoardQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class QueueBoardQueryDto extends createZodDto(queueBoardQuerySchema) {}
