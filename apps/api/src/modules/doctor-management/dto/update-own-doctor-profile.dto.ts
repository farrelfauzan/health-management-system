import { updateOwnDoctorProfileSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateOwnDoctorProfileDto extends createZodDto(updateOwnDoctorProfileSchema) {}
