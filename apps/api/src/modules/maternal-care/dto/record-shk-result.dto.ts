import { recordShkResultSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordShkResultDto extends createZodDto(recordShkResultSchema) {}
