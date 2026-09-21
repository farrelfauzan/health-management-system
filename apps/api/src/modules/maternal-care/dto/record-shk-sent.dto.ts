import { recordShkSentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordShkSentDto extends createZodDto(recordShkSentSchema) {}
