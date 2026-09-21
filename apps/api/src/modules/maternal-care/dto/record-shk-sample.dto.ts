import { recordShkSampleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordShkSampleDto extends createZodDto(recordShkSampleSchema) {}
