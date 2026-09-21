import { recordNewbornCareSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordNewbornCareDto extends createZodDto(recordNewbornCareSchema) {}
