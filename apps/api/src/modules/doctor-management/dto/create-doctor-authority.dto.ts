import { createDoctorAuthoritySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDoctorAuthorityDto extends createZodDto(createDoctorAuthoritySchema) {}
