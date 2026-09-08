import { amendLabResultSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AmendLabResultDto extends createZodDto(amendLabResultSchema) {}
