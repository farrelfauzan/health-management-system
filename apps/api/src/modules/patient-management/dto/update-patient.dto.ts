import { updatePatientSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdatePatientDto extends createZodDto(updatePatientSchema) {}
