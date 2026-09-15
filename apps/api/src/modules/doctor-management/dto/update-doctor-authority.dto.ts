import { updateDoctorAuthoritySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDoctorAuthorityDto extends createZodDto(updateDoctorAuthoritySchema) {}
