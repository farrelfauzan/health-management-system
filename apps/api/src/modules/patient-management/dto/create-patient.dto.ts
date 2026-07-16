import { createPatientSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreatePatientDto extends createZodDto(createPatientSchema) {}
