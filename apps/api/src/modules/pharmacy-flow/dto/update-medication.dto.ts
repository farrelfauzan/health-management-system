import { updateMedicationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateMedicationDto extends createZodDto(updateMedicationSchema) {}
