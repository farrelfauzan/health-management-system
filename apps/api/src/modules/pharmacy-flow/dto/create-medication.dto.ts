import { createMedicationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateMedicationDto extends createZodDto(createMedicationSchema) {}
