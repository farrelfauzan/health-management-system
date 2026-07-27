import { importPatientSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ImportPatientDto extends createZodDto(importPatientSchema) {}
