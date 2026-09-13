import { createDoctorRequestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDoctorDto extends createZodDto(createDoctorRequestSchema) {}
