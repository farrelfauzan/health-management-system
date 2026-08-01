import { antreanNewPatientRequestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AntreanNewPatientDto extends createZodDto(antreanNewPatientRequestSchema) {}
