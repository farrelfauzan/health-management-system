import { createDoctorMandateSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDoctorMandateDto extends createZodDto(createDoctorMandateSchema) {}
