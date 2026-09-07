import { labWorklistQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class LabWorklistQueryDto extends createZodDto(labWorklistQuerySchema) {}
