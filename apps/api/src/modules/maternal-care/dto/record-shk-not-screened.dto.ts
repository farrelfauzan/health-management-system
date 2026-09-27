import { recordShkNotScreenedSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordShkNotScreenedDto extends createZodDto(recordShkNotScreenedSchema) {}
