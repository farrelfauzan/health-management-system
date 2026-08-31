import { updateClinicProfileSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateClinicProfileDto extends createZodDto(updateClinicProfileSchema) {}
