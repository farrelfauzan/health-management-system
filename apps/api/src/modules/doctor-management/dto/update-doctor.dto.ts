import { updateDoctorSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDoctorDto extends createZodDto(updateDoctorSchema) {}
